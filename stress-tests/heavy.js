import { createPurchaseLoadTest } from "./runner.js";

const test = createPurchaseLoadTest({
  productNamePrefix: "k6-heavy-product",
  initialStock: Number(__ENV.INITIAL_STOCK || 18000),
  doublePurchaseRate: Number(__ENV.DOUBLE_PURCHASE_RATE || 0.02),
  stages: [
    { duration: "10s", target: 300 }, // gradual increase
    { duration: "5s", target: 1500 }, // sharp spike in the middle
    { duration: "20s", target: 1500 }, // sustained spike (stock runs out near the end of this)
    { duration: "5s", target: 0 }, // ramp down
  ],
});

export const options = test.options;
export const setup = test.setup;
export default test.vuFunction;
export const teardown = test.teardown;
export const handleSummary = test.handleSummary;
