import { createPurchaseLoadTest } from "./runner.js";

const test = createPurchaseLoadTest({
  productNamePrefix: "k6-light-product",
  initialStock: Number(__ENV.INITIAL_STOCK || 3000),
  doublePurchaseRate: Number(__ENV.DOUBLE_PURCHASE_RATE || 0.02),
  stages: [
    { duration: "8s", target: 100 }, // gradual increase
    { duration: "4s", target: 300 }, // small spike
    { duration: "13s", target: 300 }, // sustained
    { duration: "5s", target: 0 }, // ramp down
  ],
});

export const options = test.options;
export const setup = test.setup;
export default test.vuFunction;
export const teardown = test.teardown;
export const handleSummary = test.handleSummary;
