import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

// Shared k6 test logic for the purchase-flow load test. Individual profiles (light/medium/heavy)
// call createPurchaseLoadTest(config) and re-export the returned lifecycle functions.
export function createPurchaseLoadTest(config) {
  const {
    baseUrl = __ENV.BASE_URL || "http://localhost:3000",
    initialStock,
    stages,
    doublePurchaseRate = 0.02,
    differentKeySameUserRate = 0.02,
    productNamePrefix = "k6-stress-product",
  } = config;

  // Custom metrics so the summary breaks results down by outcome, not just pass/fail.
  // NOTE: purchases are async now (reserve in Redis -> queue -> worker writes Postgres), so a
  // 202 here only means "accepted for processing", not "purchase completed". Real completion
  // throughput/latency can only be measured from Postgres afterward (see integrity-check.ts).
  const accepted = new Counter("purchases_accepted");
  const alreadyCompleted = new Counter("purchases_already_completed");
  const outOfStock = new Counter("purchases_out_of_stock");
  const rateLimited = new Counter("purchases_rate_limited");
  const otherErrors = new Counter("purchases_other_errors");
  // Every iteration uses a brand-new userId, so this counts unique users that attempted a
  // purchase — tracked client-side because rejected attempts (e.g. out of stock) never reach the DB.
  const usersAttempted = new Counter("users_attempted");
  const doublePurchaseAttempts = new Counter("double_purchase_attempts");
  // Both succeeding here is correct: it's a retry with the same idempotency key, not a double
  // purchase. Informational only, not a bug indicator.
  const doublePurchaseBothSucceeded = new Counter(
    "double_purchase_both_succeeded",
  );
  const differentKeyRaceAttempts = new Counter("different_key_race_attempts");
  // Real bug indicator: the same user completed two distinct purchases (different idempotency
  // keys fired concurrently), which the one-purchase-per-user invariant should prevent.
  const sameUserRaceBothSucceeded = new Counter(
    "same_user_race_both_succeeded",
  );
  // Records seconds-since-test-start for every genuine out-of-stock 409; the metric's min is
  // effectively "when stock started running out".
  const outOfStockElapsedSeconds = new Trend("out_of_stock_elapsed_seconds");

  // 409 is shared by OutOfStockError, DuplicateTransactionError, ProductAlreadyPurchasedError, and
  // TransactionInProgressError, so the status code alone can't tell them apart.
  const isRealOutOfStock = (res) =>
    res.status === 409 && res.body?.includes("out of stock");

  // One Counter per 1s bucket of the run, so handleSummary can compute avg accepted/s up to the
  // moment stock ran out. This tracks admission throughput (Redis-bound), NOT DB completion
  // throughput anymore — see integrity-check.ts for the real completed/s figure from Postgres.
  // Covers up to 120s of runtime.
  const BUCKET_SECONDS = 1;
  const MAX_BUCKETS = 120;
  const acceptedByBucket = Array.from(
    { length: MAX_BUCKETS },
    (_, index) => new Counter(`accepted_bucket_${index}`),
  );
  const recordAcceptedRequest = (data) => {
    const elapsedSeconds = (Date.now() - data.testStartMs) / 1000;
    const bucketIndex = Math.min(
      Math.floor(elapsedSeconds / BUCKET_SECONDS),
      MAX_BUCKETS - 1,
    );
    acceptedByBucket[bucketIndex].add(1);
  };

  const options = {
    scenarios: {
      thundering_herd: {
        executor: "ramping-vus",
        startVUs: 0,
        stages,
      },
    },
    // p(99) isn't tracked by default; needed for the combined load-test report.
    summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
    // Makes k6 exit non-zero when a core invariant is violated, instead of only printing numbers.
    thresholds: {
      checks: ["rate>0.999"], // no unexpected 5xx responses
      purchases_other_errors: ["count<1"],
      same_user_race_both_succeeded: ["count==0"], // one purchase per user, no exceptions
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

    return { productId, testStartMs: Date.now() };
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
      if (first.status === 202) recordAcceptedRequest(data);
      if (second.status === 202) recordAcceptedRequest(data);

      // These are expected to conflict with each other regardless of real stock levels, so they're
      // excluded from the depletion-timestamp measurement.
      if (first.status === 202) accepted.add(1);
      else if (first.status === 200) alreadyCompleted.add(1);
      else if (first.status === 409) outOfStock.add(1);
      else if (first.status === 429) rateLimited.add(1);
      else otherErrors.add(1);

      if (second.status === 202) accepted.add(1);
      else if (second.status === 200) alreadyCompleted.add(1);
      else if (second.status === 409) outOfStock.add(1);
      else if (second.status === 429) rateLimited.add(1);
      else otherErrors.add(1);

      // Both getting accepted/already-completed is the expected shape of an idempotent retry —
      // it doesn't mean two DB rows were written, since completion happens later in the worker.
      if (
        (first.status === 202 || first.status === 200) &&
        (second.status === 202 || second.status === 200)
      ) {
        doublePurchaseBothSucceeded.add(1);
      }

      check(first, { "status is not 5xx": (r) => r.status < 500 });
      check(second, { "status is not 5xx": (r) => r.status < 500 });
      return;
    }

    if (Math.random() < differentKeySameUserRate) {
      // Same user, two distinct idempotency keys, fired at once — unlike the same-key retry above,
      // both succeeding here would be a genuine double purchase.
      const bodyA = JSON.stringify({
        productId: data.productId,
        userId,
        idempotencyKey: `${idempotencyKey}-a`,
      });
      const bodyB = JSON.stringify({
        productId: data.productId,
        userId,
        idempotencyKey: `${idempotencyKey}-b`,
      });

      const responses = http.batch([
        ["POST", `${baseUrl}/purchases`, bodyA, params],
        ["POST", `${baseUrl}/purchases`, bodyB, params],
      ]);

      differentKeyRaceAttempts.add(1);
      usersAttempted.add(1);

      const [first, second] = responses;
      if (first.status === 202) recordAcceptedRequest(data);
      if (second.status === 202) recordAcceptedRequest(data);

      if (first.status === 202) accepted.add(1);
      else if (first.status === 200) alreadyCompleted.add(1);
      else if (first.status === 409) outOfStock.add(1);
      else if (first.status === 429) rateLimited.add(1);
      else otherErrors.add(1);

      if (second.status === 202) accepted.add(1);
      else if (second.status === 200) alreadyCompleted.add(1);
      else if (second.status === 409) outOfStock.add(1);
      else if (second.status === 429) rateLimited.add(1);
      else otherErrors.add(1);

      // The real double-purchase signal: two distinct requests from the same user both admitted
      // (each reserved stock independently). Whether both actually complete is confirmed in Postgres.
      if (first.status === 202 && second.status === 202) {
        sameUserRaceBothSucceeded.add(1);
      }

      check(first, { "status is not 5xx": (r) => r.status < 500 });
      check(second, { "status is not 5xx": (r) => r.status < 500 });
      return;
    }

    const res = http.post(`${baseUrl}/purchases`, body, params);

    usersAttempted.add(1);
    if (res.status === 202) recordAcceptedRequest(data);

    if (res.status === 202) {
      accepted.add(1);
    } else if (res.status === 200) {
      alreadyCompleted.add(1);
    } else if (res.status === 409) {
      outOfStock.add(1);
      if (isRealOutOfStock(res)) {
        outOfStockElapsedSeconds.add((Date.now() - data.testStartMs) / 1000);
      }
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
    // Printed so the DB integrity check can assert stock conservation against the real starting value.
    console.log(`INITIAL_STOCK=${initialStock}`);
  }

  // Overriding handleSummary replaces k6's noisy default table with just what we care about.
  function handleSummary(data) {
    const count = (name) => data.metrics[name]?.values.count ?? 0;
    // http_req_duration values are in milliseconds; convert to seconds.
    const durationSeconds = (stat) => {
      const value = data.metrics.http_req_duration?.values[stat];
      return value !== undefined ? (value / 1000).toFixed(3) : "n/a";
    };

    const acceptedCount = count("purchases_accepted");
    const alreadyCompletedCount = count("purchases_already_completed");
    const outOfStockCount = count("purchases_out_of_stock");
    const rateLimitedCount = count("purchases_rate_limited");
    const otherErrorCount = count("purchases_other_errors");
    const usersAttemptedCount = count("users_attempted");
    const doublePurchaseAttemptsCount = count("double_purchase_attempts");
    const doublePurchaseBothSucceededCount = count(
      "double_purchase_both_succeeded",
    );
    const differentKeyRaceAttemptsCount = count("different_key_race_attempts");
    const sameUserRaceBothSucceededCount = count(
      "same_user_race_both_succeeded",
    );
    const totalRequests = data.metrics.http_reqs?.values.count ?? 0;
    const maxVUs = data.metrics.vus_max?.values.max ?? 0;
    const percent = (n) =>
      totalRequests > 0 ? ((n / totalRequests) * 100).toFixed(1) : "0.0";
    const stockRanOutAtSeconds =
      data.metrics.out_of_stock_elapsed_seconds?.values.min;
    const durationSecondsTotal = (data.state?.testRunDurationMs ?? 0) / 1000;

    const acceptedBucketCounts = acceptedByBucket.map((_, index) =>
      count(`accepted_bucket_${index}`),
    );

    // NOTE: this is admission throughput (Redis reservation + queue publish), not DB completion
    // throughput — purchases are async now, so k6 never observes the worker actually committing to
    // Postgres. Real completed/s and completion latency come from integrity-check.ts querying
    // transactions.created_at/updated_at after the run.
    const preDepletionSeconds = stockRanOutAtSeconds ?? durationSecondsTotal;
    const preDepletionBucketCount = Math.min(
      Math.ceil(preDepletionSeconds / BUCKET_SECONDS),
      acceptedBucketCounts.length,
    );
    const preDepletionAccepted = acceptedBucketCounts
      .slice(0, preDepletionBucketCount)
      .reduce((sum, value) => sum + value, 0);
    const avgAcceptedPerSecond =
      preDepletionSeconds > 0 ? preDepletionAccepted / preDepletionSeconds : 0;

    const lines = [
      "",
      `Max VUs:            ${maxVUs}`,
      `Total requests:      ${totalRequests}`,
      "",
      `Avg accepted/s (pre-depletion, admission only): ${avgAcceptedPerSecond.toFixed(1)}`,
      "(Real completed/s + latency now come from Postgres — see integrity check output below)",
      "",
      `Accepted (202):        ${acceptedCount}  (${percent(acceptedCount)}%)`,
      `Already completed (200): ${alreadyCompletedCount}  (${percent(alreadyCompletedCount)}%)`,
      `Out of stock (409):  ${outOfStockCount}  (${percent(outOfStockCount)}%)`,
      `Rate limited (429):  ${rateLimitedCount}  (${percent(rateLimitedCount)}%)`,
      `Other errors:        ${otherErrorCount}  (${percent(otherErrorCount)}%)`,
      "",
      `Idempotent-retry attempts (same key):      ${doublePurchaseAttemptsCount}`,
      `Idempotent-retry BOTH succeeded (expected): ${doublePurchaseBothSucceededCount}`,
      "",
      `Different-key race attempts (same user):    ${differentKeyRaceAttemptsCount}`,
      `Same-user race BOTH succeeded (bug!):        ${sameUserRaceBothSucceededCount}`,
      "",
      stockRanOutAtSeconds !== undefined
        ? `Stock started running out at: ${stockRanOutAtSeconds.toFixed(1)}s into the test`
        : "Stock started running out at: never (stock never depleted)",
      "",
      "HTTP admission latency (s) — accept/reject only, NOT purchase completion:",
      `  avg:  ${durationSeconds("avg")}`,
      `  p90:  ${durationSeconds("p(90)")}`,
      `  p95:  ${durationSeconds("p(95)")}`,
      `  max:  ${durationSeconds("max")}`,
      "",
    ];

    // Printed so the run.sh wrapper can pass this into the DB integrity check.
    console.log(`USERS_ATTEMPTED=${usersAttemptedCount}`);

    // "Error rate" only counts unexpected failures, not the expected 409/429 rejections.
    const errorRatePercent =
      totalRequests > 0 ? (otherErrorCount / totalRequests) * 100 : 0;

    const jsonSummary = {
      durationSeconds: durationSecondsTotal.toFixed(1),
      avgAcceptedPerSecond: avgAcceptedPerSecond.toFixed(1),
      avgLatencySeconds: durationSeconds("avg"),
      p95LatencySeconds: durationSeconds("p(95)"),
      p99LatencySeconds: durationSeconds("p(99)"),
      errorRatePercent: errorRatePercent.toFixed(2),
      stockRanOutAtSeconds: stockRanOutAtSeconds?.toFixed(1) ?? "n/a",
    };

    return {
      stdout: lines.join("\n") + "\n",
      "stress-tests/.last-k6-summary.json": JSON.stringify(
        jsonSummary,
        null,
        2,
      ),
    };
  }

  return { options, setup, vuFunction, teardown, handleSummary };
}
