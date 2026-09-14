import { useEffect, useState } from "react";

type FlashSale = {
  id: string;
  productId: string;
  startTime: string;
  endTime: string;
  status: "UPCOMING" | "ACTIVE" | "ENDED";
};

type SalesState = {
  sales: FlashSale[];
  error: string;
  loadedRevision: string;
};

export default function FlashSalesTable({
  productId,
  revision,
}: {
  productId: string;
  revision: number;
}) {
  const [selectedProductId, setSelectedProductId] = useState(productId);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<SalesState>({
    sales: [],
    error: "",
    loadedRevision: "",
  });
  const requestRevision = `${selectedProductId}-${revision}-${refresh}`;
  const loading =
    Boolean(selectedProductId) && state.loadedRevision !== requestRevision;

  useEffect(() => {
    if (!selectedProductId) return;
    const controller = new AbortController();
    async function loadSales() {
      try {
        const response = await fetch(
          `/api/products/${encodeURIComponent(selectedProductId)}/flash-sales`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(
            data?.message || `Could not load flash sales (${response.status}).`,
          );
        }
        const sales: FlashSale[] = await response.json();
        if (!controller.signal.aborted)
          setState({ sales, error: "", loadedRevision: requestRevision });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((previous) => ({
            ...previous,
            error:
              error instanceof Error
                ? error.message
                : "Could not load flash sales.",
            loadedRevision: requestRevision,
          }));
        }
      }
    }
    void loadSales();
    return () => controller.abort();
  }, [selectedProductId, requestRevision]);

  return (
    <section className="sales-section" aria-labelledby="sales-heading">
      <div className="sales-heading">
        <h2 id="sales-heading">Flash Sales</h2>
        <div className="sales-controls">
          <label>
            Product ID
            <input
              value={selectedProductId}
              onChange={(event) => setSelectedProductId(event.target.value)}
            />
          </label>
          <button
            type="button"
            aria-label="Refresh flash sales"
            onClick={() => setRefresh((value) => value + 1)}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      <p className="hint">
        {selectedProductId
          ? `Product: ${selectedProductId}`
          : "Enter a product ID to see its flash sales."}
      </p>
      <p
        role="status"
        className={state.error && !loading ? "feedback error" : "feedback"}
      >
        {loading ? "Loading flash sales…" : state.error}
      </p>
      <div className="table-scroll">
        <table aria-busy={loading}>
          <caption>
            Sales for the created product. Times are shown in your local
            timezone.
          </caption>
          <thead>
            <tr>
              <th scope="col">Sale ID</th>
              <th scope="col">Status</th>
              <th scope="col">Start time</th>
              <th scope="col">End time</th>
            </tr>
          </thead>
          <tbody>
            {state.sales.map((sale) => (
              <tr key={sale.id}>
                <td>{sale.id}</td>
                <td>
                  <span className={`sale-status ${sale.status.toLowerCase()}`}>
                    {sale.status}
                  </span>
                </td>
                <td>{new Date(sale.startTime).toLocaleString()}</td>
                <td>{new Date(sale.endTime).toLocaleString()}</td>
              </tr>
            ))}
            {state.sales.length === 0 && (
              <tr>
                <td colSpan={4} className="empty-sales">
                  {!selectedProductId
                    ? "Enter a product ID to load flash sales."
                    : loading
                      ? "Loading…"
                      : state.error
                        ? "Flash sales could not be loaded. Try Refresh."
                        : "No flash sales yet. Create one using the form above."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
