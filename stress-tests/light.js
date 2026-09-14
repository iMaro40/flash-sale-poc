import { createPurchaseLoadTest } from "./runner.js";

const test = createPurchaseLoadTest({
  productNamePrefix: "k6-light-product",
  // Completion throughput is capped by Postgres row-lock contention (~700-800/s, same ceiling
  // heavy.js observed), independent of VU count. Sized so stock runs out near the end of the
  // sustained stage (t=25s) instead of within the first few seconds.
  initialStock: Number(__ENV.INITIAL_STOCK || 18000),
  doublePurchaseRate: Number(__ENV.DOUBLE_PURCHASE_RATE || 0.02),
  stages: [
    { duration: "8s", target: 100 }, // gradual increase
    { duration: "4s", target: 300 }, // small spike
    { duration: "13s", target: 300 }, // sustained (stock runs out near the end of this)
    { duration: "5s", target: 0 }, // ramp down
  ],
});

export const options = test.options;
export const setup = test.setup;
export default test.vuFunction;
export const teardown = test.teardown;
export const handleSummary = test.handleSummary;
