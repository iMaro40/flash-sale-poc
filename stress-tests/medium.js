import { createPurchaseLoadTest } from "./runner.js";

const test = createPurchaseLoadTest({
  productNamePrefix: "k6-medium-product",
  initialStock: Number(__ENV.INITIAL_STOCK || 9000),
  doublePurchaseRate: Number(__ENV.DOUBLE_PURCHASE_RATE || 0.02),
  stages: [
    { duration: "12s", target: 300 }, // gradual increase
    { duration: "6s", target: 800 }, // spike
    { duration: "24s", target: 800 }, // sustained spike
    { duration: "8s", target: 0 }, // ramp down
  ],
});

export const options = test.options;
export const setup = test.setup;
export default test.vuFunction;
export const teardown = test.teardown;
export const handleSummary = test.handleSummary;
