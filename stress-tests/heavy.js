import { createPurchaseLoadTest } from "./runner.js";

const test = createPurchaseLoadTest({
  productNamePrefix: "k6-heavy-product",
  // Stock = shared throughput assumption (~750/s, row-lock-limited, independent of VU count) x
  // target depletion time (sustainedEnd - 3s buffer). Same constant used in light.js/medium.js so
  // stock scales consistently with test length instead of per-profile single-run measurements.
  initialStock: Number(__ENV.INITIAL_STOCK || 24000),
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
