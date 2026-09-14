import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const INITIAL_STOCK = Number(__ENV.INITIAL_STOCK || 50);

// Custom metrics so the summary breaks results down by outcome, not just pass/fail.
const purchased = new Counter("purchases_succeeded");
const outOfStock = new Counter("purchases_out_of_stock");
const rateLimited = new Counter("purchases_rate_limited");
const otherErrors = new Counter("purchases_other_errors");

export const options = {
  scenarios: {
    thundering_herd: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "5s", target: 50 },
        { duration: "10s", target: 50 },
        { duration: "5s", target: 0 },
      ],
    },
  },
};

// setup() runs once before load starts, outside of VU iterations.
export function setup() {
  const productRes = http.post(
    `${BASE_URL}/products`,
    JSON.stringify({
      name: `k6-stress-product-${Date.now()}`,
      stock: INITIAL_STOCK,
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  if (productRes.status !== 201) {
    throw new Error(
      `Failed to create product: ${productRes.status} ${productRes.body}`,
    );
  }

  const productId = productRes.json("id");

  const flashSaleRes = http.post(
    `${BASE_URL}/flash-sales`,
    JSON.stringify({
      productId,
      startTime: new Date(Date.now() - 1000).toISOString(),
      endTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  if (flashSaleRes.status !== 201) {
    throw new Error(
      `Failed to create flash sale: ${flashSaleRes.status} ${flashSaleRes.body}`,
    );
  }

  return { productId };
}

export default function (data) {
  const uniqueSuffix = `${__VU}-${__ITER}-${Date.now()}`;

  const res = http.post(
    `${BASE_URL}/purchases`,
    JSON.stringify({
      productId: data.productId,
      userId: `user-${uniqueSuffix}`,
      idempotencyKey: `idem-${uniqueSuffix}`,
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  if (res.status === 201) {
    purchased.add(1);
  } else if (res.status === 409) {
    outOfStock.add(1);
  } else if (res.status === 429) {
    rateLimited.add(1);
  } else {
    otherErrors.add(1);
  }

  check(res, {
    "status is not 5xx": (r) => r.status < 500,
  });
}

// teardown() runs once after load finishes; report final DB/Redis-visible product state.
export function teardown(data) {
  const res = http.get(`${BASE_URL}/products/${data.productId}`);
  const product = res.json();
  console.log(`FINAL_STOCK=${product.stock}`);
  // Printed so the run.sh wrapper can pass this product into the DB integrity check.
  console.log(`PRODUCT_ID=${data.productId}`);
}

// Overriding handleSummary replaces k6's noisy default table with just what we care about.
export function handleSummary(data) {
  const count = (name) => data.metrics[name]?.values.count ?? 0;
  const duration = (stat) =>
    data.metrics.http_req_duration?.values[stat]?.toFixed(2) ?? "n/a";

  const succeeded = count("purchases_succeeded");
  const outOfStockCount = count("purchases_out_of_stock");
  const rateLimitedCount = count("purchases_rate_limited");
  const otherErrorCount = count("purchases_other_errors");
  const totalRequests = data.metrics.http_reqs?.values.count ?? 0;
  const maxVUs = data.metrics.vus_max?.values.max ?? 0;
  const percent = (n) =>
    totalRequests > 0 ? ((n / totalRequests) * 100).toFixed(1) : "0.0";

  const lines = [
    "",
    "Flash Sale Purchase Stress Test",
    "================================",
    `Max VUs:            ${maxVUs}`,
    `Total requests:      ${totalRequests}`,
    "",
    `Succeeded (201):     ${succeeded}  (${percent(succeeded)}%)`,
    `Out of stock (409):  ${outOfStockCount}  (${percent(outOfStockCount)}%)`,
    `Rate limited (429):  ${rateLimitedCount}  (${percent(rateLimitedCount)}%)`,
    `Other errors:        ${otherErrorCount}  (${percent(otherErrorCount)}%)`,
    "",
    `Latency (ms)   avg=${duration("avg")}  p90=${duration("p(90)")}  p95=${duration("p(95)")}  max=${duration("max")}`,
    "",
  ];

  return { stdout: lines.join("\n") + "\n" };
}
