import { createPurchaseLoadTest } from "./runner.js";

const test = createPurchaseLoadTest({
  productNamePrefix: "k6-light-product",
  // Stock = shared throughput assumption (~750/s, row-lock-limited, independent of VU count) x
  // target depletion time (sustainedEnd - 3s buffer). Same constant used in medium.js/heavy.js so
  // stock scales consistently with test length instead of per-profile single-run measurements.
  initialStock: Number(__ENV.INITIAL_STOCK || 16500),
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
