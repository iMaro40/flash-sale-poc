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
  console.log(`Final product state: ${res.body}`);
}
