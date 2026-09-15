import { createPurchaseLoadTest } from "./runner.js";

const test = createPurchaseLoadTest({
  productNamePrefix: "k6-light-product",
  // Stock is reserved at HTTP admission speed (Redis), so size it for depletion near the end of
  // the sustained stage rather than using the slower Postgres completion rate.
  initialStock: Number(__ENV.INITIAL_STOCK || 35000),
  doublePurchaseRate: Number(__ENV.DOUBLE_PURCHASE_RATE || 0.02),
  stages: [
    { duration: "8s", target: 100 }, // gradual increase
    { duration: "4s", target: 300 }, // small spike
    { duration: "13s", target: 300 }, // sustained (stock runs out ~3s before this ends)
    { duration: "5s", target: 0 }, // ramp down
  ],
});

export const options = test.options;
export const setup = test.setup;
export default test.vuFunction;
export const teardown = test.teardown;
export const handleSummary = test.handleSummary;
