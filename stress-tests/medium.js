import { createPurchaseLoadTest } from "./runner.js";

const test = createPurchaseLoadTest({
  productNamePrefix: "k6-medium-product",
  // Stock is reserved at HTTP admission speed (Redis), so size it for depletion near the end of
  // the sustained stage rather than using the slower Postgres completion rate.
  initialStock: Number(__ENV.INITIAL_STOCK || 40000),
  doublePurchaseRate: Number(__ENV.DOUBLE_PURCHASE_RATE || 0.02),
  stages: [
    { duration: "10s", target: 300 }, // gradual increase
    { duration: "5s", target: 800 }, // spike
    { duration: "20s", target: 800 }, // sustained spike
    { duration: "5s", target: 0 }, // ramp down
  ],
});

export const options = test.options;
export const setup = test.setup;
export default test.vuFunction;
export const teardown = test.teardown;
export const handleSummary = test.handleSummary;
