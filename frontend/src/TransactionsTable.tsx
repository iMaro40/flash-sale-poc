import { useEffect, useState } from 'react'

type Transaction = {
  id: string
  productId: string
  userId: string
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED'
  createdAt: string
  updatedAt: string
}

type TransactionsState = {
  transactions: Transaction[]
  error: string
  loadedRevision: string
}

export default function TransactionsTable({ revision }: { revision: number }) {
  const [refresh, setRefresh] = useState(0)
  const [state, setState] = useState<TransactionsState>({ transactions: [], error: '', loadedRevision: '' })
  const requestRevision = `${revision}-${refresh}`
  const loading = state.loadedRevision !== requestRevision

  useEffect(() => {
    const controller = new AbortController()
    async function loadTransactions() {
      try {
        const response = await fetch('/api/transactions', { signal: controller.signal })
        if (!response.ok) {
          const data = await response.json().catch(() => null)
          throw new Error(data?.message || `Could not load transactions (${response.status}).`)
        }
        const transactions: Transaction[] = await response.json()
        if (!controller.signal.aborted) setState({ transactions, error: '', loadedRevision: requestRevision })
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((previous) => ({ ...previous, error: error instanceof Error ? error.message : 'Could not load transactions.', loadedRevision: requestRevision }))
        }
      }
    }
    void loadTransactions()
    return () => controller.abort()
  }, [requestRevision])

  // Transactions are processed asynchronously by the purchase worker, so poll for status updates.
  useEffect(() => {
    const controller = new AbortController()
    async function pollTransactions() {
      try {
        const response = await fetch('/api/transactions', { signal: controller.signal })
        if (!response.ok) return
        const transactions: Transaction[] = await response.json()
        if (!controller.signal.aborted) setState((previous) => ({ ...previous, transactions, error: '' }))
      } catch {
        // Ignore poll errors; the next tick will retry.
      }
    }
    const intervalId = setInterval(() => void pollTransactions(), 3000)
    return () => {
      controller.abort()
      clearInterval(intervalId)
    }
  }, [])

  return (
    <section className="sales-section" aria-labelledby="transactions-heading">
      <div className="sales-heading">
        <h2 id="transactions-heading">Transactions</h2>
        <button type="button" aria-label="Refresh transactions" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <p className="hint">All purchase transactions, newest first.</p>
      <p role="status" className={state.error && !loading ? 'feedback error' : 'feedback'}>
        {loading ? 'Loading transactions…' : state.error}
      </p>
      <div className="table-scroll">
        <table aria-busy={loading}>
          <caption>Transaction history. Times are shown in your local timezone.</caption>
          <thead>
            <tr>
              <th scope="col">Transaction ID</th>
              <th scope="col">Product ID</th>
              <th scope="col">User ID</th>
              <th scope="col">Status</th>
              <th scope="col">Created</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {state.transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.id}</td>
                <td>{transaction.productId}</td>
                <td>{transaction.userId}</td>
                <td><span className={`sale-status ${transaction.status === 'COMPLETED' ? 'active' : 'upcoming'}`}>{transaction.status}</span></td>
                <td>{new Date(transaction.createdAt).toLocaleString()}</td>
                <td>{new Date(transaction.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
            {state.transactions.length === 0 && <tr><td colSpan={6} className="empty-sales">{loading ? 'Loading…' : state.error ? 'Transactions could not be loaded. Try Refresh.' : 'No transactions yet. Make a purchase using the form above.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
