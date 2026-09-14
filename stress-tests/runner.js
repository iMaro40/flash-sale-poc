import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

// Shared k6 test logic for the purchase-flow load test. Individual profiles (light/medium/heavy)
// call createPurchaseLoadTest(config) and re-export the returned lifecycle functions.
export function createPurchaseLoadTest(config) {
  const {
    baseUrl = __ENV.BASE_URL || "http://localhost:3000",
    initialStock,
    stages,
    doublePurchaseRate = 0.02,
    productNamePrefix = "k6-stress-product",
  } = config;

  // Custom metrics so the summary breaks results down by outcome, not just pass/fail.
  const purchased = new Counter("purchases_succeeded");
  const outOfStock = new Counter("purchases_out_of_stock");
  const rateLimited = new Counter("purchases_rate_limited");
  const otherErrors = new Counter("purchases_other_errors");
  // Every iteration uses a brand-new userId, so this counts unique users that attempted a
  // purchase — tracked client-side because rejected attempts (e.g. out of stock) never reach the DB.
  const usersAttempted = new Counter("users_attempted");
  const doublePurchaseAttempts = new Counter("double_purchase_attempts");
  // Bug indicator: both concurrent requests for the same user+idempotencyKey were treated as successful.
  const doublePurchaseBothSucceeded = new Counter(
    "double_purchase_both_succeeded",
  );

  const options = {
    scenarios: {
      thundering_herd: {
        executor: "ramping-vus",
        startVUs: 0,
        stages,
      },
    },
  };

  // setup() runs once before load starts, outside of VU iterations.
  function setup() {
    const productRes = http.post(
      `${baseUrl}/products`,
      JSON.stringify({
        name: `${productNamePrefix}-${Date.now()}`,
        stock: initialStock,
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
      `${baseUrl}/flash-sales`,
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

  function vuFunction(data) {
    const uniqueSuffix = `${__VU}-${__ITER}-${Date.now()}`;
    const userId = `user-${uniqueSuffix}`;
    const idempotencyKey = `idem-${uniqueSuffix}`;
    const body = JSON.stringify({
      productId: data.productId,
      userId,
      idempotencyKey,
    });
    const params = { headers: { "Content-Type": "application/json" } };

    if (Math.random() < doublePurchaseRate) {
      // Same user, same idempotencyKey, fired at once — targets the reservation/transaction race window.
      const responses = http.batch([
        ["POST", `${baseUrl}/purchases`, body, params],
        ["POST", `${baseUrl}/purchases`, body, params],
      ]);

      doublePurchaseAttempts.add(1);
      usersAttempted.add(1);

      const [first, second] = responses;

      if (first.status === 201) purchased.add(1);
      else if (first.status === 409) outOfStock.add(1);
      else if (first.status === 429) rateLimited.add(1);
      else otherErrors.add(1);

      if (second.status === 201) purchased.add(1);
      else if (second.status === 409) outOfStock.add(1);
      else if (second.status === 429) rateLimited.add(1);
      else otherErrors.add(1);

      if (first.status === 201 && second.status === 201) {
        doublePurchaseBothSucceeded.add(1);
      }

      check(first, { "status is not 5xx": (r) => r.status < 500 });
      check(second, { "status is not 5xx": (r) => r.status < 500 });
      return;
    }

    const res = http.post(`${baseUrl}/purchases`, body, params);

    usersAttempted.add(1);

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
  function teardown(data) {
    const res = http.get(`${baseUrl}/products/${data.productId}`);
    const product = res.json();
    console.log(`FINAL_STOCK=${product.stock}`);
    // Printed so the run.sh wrapper can pass this product into the DB integrity check.
    console.log(`PRODUCT_ID=${data.productId}`);
  }

  // Overriding handleSummary replaces k6's noisy default table with just what we care about.
  function handleSummary(data) {
    const count = (name) => data.metrics[name]?.values.count ?? 0;
    // http_req_duration values are in milliseconds; convert to seconds.
    const durationSeconds = (stat) => {
      const value = data.metrics.http_req_duration?.values[stat];
      return value !== undefined ? (value / 1000).toFixed(3) : "n/a";
    };

    const succeeded = count("purchases_succeeded");
    const outOfStockCount = count("purchases_out_of_stock");
    const rateLimitedCount = count("purchases_rate_limited");
    const otherErrorCount = count("purchases_other_errors");
    const usersAttemptedCount = count("users_attempted");
    const doublePurchaseAttemptsCount = count("double_purchase_attempts");
    const doublePurchaseBothSucceededCount = count(
      "double_purchase_both_succeeded",
    );
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
      `Double-purchase attempts:      ${doublePurchaseAttemptsCount}`,
      `Double-purchase BOTH succeeded (bug!): ${doublePurchaseBothSucceededCount}`,
      "",
      "Latency (s)",
      `  avg:  ${durationSeconds("avg")}`,
      `  p90:  ${durationSeconds("p(90)")}`,
      `  p95:  ${durationSeconds("p(95)")}`,
      `  max:  ${durationSeconds("max")}`,
      "",
    ];

    // Printed so the run.sh wrapper can pass this into the DB integrity check.
    console.log(`USERS_ATTEMPTED=${usersAttemptedCount}`);

    return { stdout: lines.join("\n") + "\n" };
  }

  return { options, setup, vuFunction, teardown, handleSummary };
}
