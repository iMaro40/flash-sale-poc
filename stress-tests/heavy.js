import { createPurchaseLoadTest } from "./runner.js";

const test = createPurchaseLoadTest({
  productNamePrefix: "k6-heavy-product",
  // Tuned from observed sustained throughput (~700 completions/sec at pool max:10) so stock runs
  // out near the end of the sustained spike, not before or never.
  initialStock: Number(__ENV.INITIAL_STOCK || 26000),
  doublePurchaseRate: Number(__ENV.DOUBLE_PURCHASE_RATE || 0.02),
  stages: [
    { duration: "10s", target: 500 }, // gradual increase
    { duration: "5s", target: 2500 }, // sharp spike in the middle
    { duration: "20s", target: 2500 }, // sustained spike (stock runs out near the end of this)
    { duration: "5s", target: 0 }, // ramp down
  ],
});

export const options = test.options;
export const setup = test.setup;
export default test.vuFunction;
export const teardown = test.teardown;
export const handleSummary = test.handleSummary;
