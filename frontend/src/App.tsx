import { useState, type FormEvent } from 'react'

type Result = { pending: boolean; message: string; error: boolean }
const initialResult: Result = { pending: false, message: '', error: false }

function localTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16)
}

async function post(path: string, body: object) {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`)
  return data
}

function Feedback({ result }: { result: Result }) {
  return <p className={result.error ? 'feedback error' : 'feedback'} role="status">{result.message}</p>
}

function App() {
  const [name, setName] = useState('Limited Edition Sneakers')
  const [stock, setStock] = useState('100')
  const [saleProductId, setSaleProductId] = useState('demo-product')
  const [purchaseProductId, setPurchaseProductId] = useState('demo-product')
  const [startTime, setStartTime] = useState(() => localTime(new Date()))
  const [endTime, setEndTime] = useState(() => localTime(new Date(Date.now() + 3_600_000)))
  const [userId, setUserId] = useState('demo-user')
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [productResult, setProductResult] = useState(initialResult)
  const [saleResult, setSaleResult] = useState(initialResult)
  const [purchaseResult, setPurchaseResult] = useState(initialResult)

  async function submit(
    event: FormEvent<HTMLFormElement>,
    setResult: (result: Result) => void,
    action: () => Promise<string>,
  ) {
    event.preventDefault()
    setResult({ pending: true, message: 'Submitting…', error: false })
    try {
      const message = await action()
      setResult({ pending: false, message, error: false })
    } catch (error) {
      setResult({ pending: false, message: error instanceof Error ? error.message : 'Request failed. Please try again.', error: true })
    }
  }

  return (
    <main>
      <header>
        <p className="eyebrow">FLASH SALE DEMO</p>
        <h1>Set up a sale. Make a purchase.</h1>
        <p>Start with a product, create its sale, then try a purchase. Default values are ready to edit.</p>
      </header>
      <div className="forms">
        <form onSubmit={(event) => void submit(event, setProductResult, async () => {
          const product = await post('/products', { name: name.trim(), stock: Number(stock) })
          setSaleProductId(product.id)
          setPurchaseProductId(product.id)
          setIdempotencyKey(crypto.randomUUID())
          return `Product created: ${product.id}. Product IDs below have been filled in.`
        })}>
          <span className="step">01</span>
          <h2>Create Product</h2>
          <p className="description">Add a product and its available stock.</p>
          <label>Product name<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Stock<input required type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} /></label>
          <button disabled={productResult.pending}>{productResult.pending ? 'Creating…' : 'Create Product'}</button>
          <Feedback result={productResult} />
        </form>
        <form onSubmit={(event) => void submit(event, setSaleResult, async () => {
          if (new Date(endTime) <= new Date(startTime)) throw new Error('End time must be after start time.')
          if (new Date(endTime) <= new Date()) throw new Error('End time must be in the future.')
          const sale = await post('/flash-sales', { productId: saleProductId.trim(), startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString() })
          return `Flash sale created: ${sale.flashSaleId}`
        })}>
          <span className="step">02</span>
          <h2>Create Flash Sale</h2>
          <p className="description">Defaults to a one-hour sale. Times are local.</p>
          <label>Product ID<input required pattern="[^:]+" value={saleProductId} onChange={(e) => setSaleProductId(e.target.value)} /></label>
          <label>Start time<input required type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
          <label>End time<input required type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
          <button disabled={saleResult.pending}>{saleResult.pending ? 'Creating…' : 'Create Flash Sale'}</button>
          <Feedback result={saleResult} />
        </form>
        <form onSubmit={(event) => void submit(event, setPurchaseResult, async () => {
          const purchase = await post('/purchases', { productId: purchaseProductId.trim(), userId: userId.trim(), idempotencyKey })
          return purchase.message
        })}>
          <span className="step">03</span>
          <h2>Purchase Product</h2>
          <p className="description">Purchase one unit during the active sale.</p>
          <label>Product ID<input required pattern="[^:]+" value={purchaseProductId} onChange={(e) => { setPurchaseProductId(e.target.value); setIdempotencyKey(crypto.randomUUID()) }} /></label>
          <label>User ID<input required pattern="[^:]+" value={userId} onChange={(e) => { setUserId(e.target.value); setIdempotencyKey(crypto.randomUUID()) }} /></label>
          <button disabled={purchaseResult.pending}>{purchaseResult.pending ? 'Purchasing…' : 'Purchase Product'}</button>
          <Feedback result={purchaseResult} />
        </form>
      </div>
      <p className="hint">Create a product first to replace the sample product IDs automatically.</p>
    </main>
  )
}

export default App
