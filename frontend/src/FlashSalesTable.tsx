import { useEffect, useState } from 'react'

type FlashSale = {
  id: string
  productId: string
  startTime: string
  endTime: string
  status: 'UPCOMING' | 'ACTIVE' | 'ENDED'
}

type SalesState = {
  sales: FlashSale[]
  error: string
  loadedRevision: string
}

export default function FlashSalesTable({ productId, revision }: { productId: string; revision: number }) {
  const [refresh, setRefresh] = useState(0)
  const [state, setState] = useState<SalesState>({ sales: [], error: '', loadedRevision: '' })
  const requestRevision = `${revision}-${refresh}`
  const loading = Boolean(productId) && state.loadedRevision !== requestRevision

  useEffect(() => {
    if (!productId) return
    const controller = new AbortController()
    async function loadSales() {
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(productId)}/flash-sales`, { signal: controller.signal })
        if (!response.ok) {
          const data = await response.json().catch(() => null)
          throw new Error(data?.message || `Could not load flash sales (${response.status}).`)
        }
        const sales: FlashSale[] = await response.json()
        if (!controller.signal.aborted) setState({ sales, error: '', loadedRevision: requestRevision })
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((previous) => ({ ...previous, error: error instanceof Error ? error.message : 'Could not load flash sales.', loadedRevision: requestRevision }))
        }
      }
    }
    void loadSales()
    return () => controller.abort()
  }, [productId, requestRevision])

  return (
    <section className="sales-section" aria-labelledby="sales-heading">
      <div className="sales-heading">
        <div>
          <h2 id="sales-heading">Flash Sales</h2>
          <p>{productId ? `Product: ${productId}` : 'Create a product to see its flash sales here.'}</p>
        </div>
        <button type="button" disabled={!productId || loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
      </div>
      <p role="status" className={state.error && !loading ? 'feedback error' : 'feedback'}>
        {loading ? 'Loading flash sales…' : state.error}
      </p>
      <div className="table-scroll">
        <table aria-busy={loading}>
          <caption>Sales for the created product. Times are shown in your local timezone.</caption>
          <thead><tr><th scope="col">Sale ID</th><th scope="col">Status</th><th scope="col">Start time</th><th scope="col">End time</th></tr></thead>
          <tbody>
            {state.sales.map((sale) => (
              <tr key={sale.id}>
                <td>{sale.id}</td>
                <td><span className={`sale-status ${sale.status.toLowerCase()}`}>{sale.status}</span></td>
                <td>{new Date(sale.startTime).toLocaleString()}</td>
                <td>{new Date(sale.endTime).toLocaleString()}</td>
              </tr>
            ))}
            {state.sales.length === 0 && <tr><td colSpan={4} className="empty-sales">{!productId ? 'No product created yet.' : loading ? 'Loading…' : state.error ? 'Flash sales could not be loaded. Try Refresh.' : 'No flash sales yet. Create one using the form above.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
