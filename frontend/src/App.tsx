import { useState, type FormEvent } from "react";
import FlashSalesTable from "./FlashSalesTable";
import TransactionsTable from "./TransactionsTable";

type Result = { pending: boolean; message: string; error: boolean };
const initialResult: Result = { pending: false, message: "", error: false };

function localTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

async function post(path: string, body: object) {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

function Feedback({ result }: { result: Result }) {
  return (
    <p className={result.error ? "feedback error" : "feedback"} role="status">
      {result.message}
    </p>
  );
}

function App() {
  const [name, setName] = useState("Limited Edition Sneakers");
  const [stock, setStock] = useState("100");
  const [saleProductId, setSaleProductId] = useState("demo-product");
  const [purchaseProductId, setPurchaseProductId] = useState("demo-product");
  const [startTime, setStartTime] = useState(() => localTime(new Date()));
  const [endTime, setEndTime] = useState(() =>
    localTime(new Date(Date.now() + 3_600_000)),
  );
  const [userId, setUserId] = useState("demo-user");
  const [idempotencyKey, setIdempotencyKey] = useState("key-123");
  const [productResult, setProductResult] = useState(initialResult);
  const [saleResult, setSaleResult] = useState(initialResult);
  const [purchaseResult, setPurchaseResult] = useState(initialResult);
  const [createdProductId, setCreatedProductId] = useState("");
  const [salesRevision, setSalesRevision] = useState(0);
  const [transactionsRevision, setTransactionsRevision] = useState(0);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    setResult: (result: Result) => void,
    action: () => Promise<string>,
  ) {
    event.preventDefault();
    setResult({ pending: true, message: "Submitting…", error: false });
    try {
      const message = await action();
      setResult({ pending: false, message, error: false });
    } catch (error) {
      setResult({
        pending: false,
        message:
          error instanceof Error
            ? error.message
            : "Request failed. Please try again.",
        error: true,
      });
    }
  }

  function handleCreateProductSubmit(event: FormEvent<HTMLFormElement>) {
    if (createdProductId || productResult.pending) {
      event.preventDefault();
      return;
    }
    void submit(event, setProductResult, async () => {
      const product = await post("/products", {
        name: name.trim(),
        stock: Number(stock),
      });
      setCreatedProductId(product.id);
      setSaleProductId(product.id);
      setPurchaseProductId(product.id);
      setIdempotencyKey("key-123");
      return `Product created: ${product.id}. Product IDs below have been filled in.`;
    });
  }

  function handleCreateFlashSaleSubmit(event: FormEvent<HTMLFormElement>) {
    void submit(event, setSaleResult, async () => {
      if (new Date(endTime) <= new Date(startTime))
        throw new Error("End time must be after start time.");
      if (new Date(endTime) <= new Date())
        throw new Error("End time must be in the future.");
      const sale = await post("/flash-sales", {
        productId: saleProductId.trim(),
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      });
      setSalesRevision((revision) => revision + 1);
      return `Flash sale created: ${sale.flashSaleId}`;
    });
  }

  function handlePurchaseSubmit(event: FormEvent<HTMLFormElement>) {
    void submit(event, setPurchaseResult, async () => {
      const purchase = await post("/purchases", {
        productId: purchaseProductId.trim(),
        userId: userId.trim(),
        idempotencyKey,
      });
      setTransactionsRevision((revision) => revision + 1);
      return purchase.message;
    });
  }

  function handlePurchaseProductIdChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    setPurchaseProductId(event.target.value);
    setIdempotencyKey("key-123");
  }

  function handleUserIdChange(event: React.ChangeEvent<HTMLInputElement>) {
    setUserId(event.target.value);
  }

  return (
    <main>
      <header>
        <p className="eyebrow">FLASH SALE DEMO</p>
        <h1>Set up a sale. Make a purchase.</h1>
        <p>
          Start with a product, create its sale, then try a purchase. Default
          values are ready to edit.
        </p>
      </header>
      <div className="forms">
        <form onSubmit={handleCreateProductSubmit}>
          <span className="step">01</span>
          <h2>Create Product</h2>
          <p className="description">
            {createdProductId
              ? "This demo supports one product. Use the created product for your sales and purchases."
              : "Add a product and its available stock. This demo supports one product."}
          </p>
          <label>
            Product name
            <input
              required
              disabled={Boolean(createdProductId) || productResult.pending}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Stock
            <input
              required
              disabled={Boolean(createdProductId) || productResult.pending}
              type="number"
              min="0"
              step="1"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </label>
          <button disabled={Boolean(createdProductId) || productResult.pending}>
            {productResult.pending
              ? "Creating…"
              : createdProductId
                ? "Product Created"
                : "Create Product"}
          </button>
          <Feedback result={productResult} />
        </form>
        <form onSubmit={handleCreateFlashSaleSubmit}>
          <span className="step">02</span>
          <h2>Create Flash Sale</h2>
          <p className="description">
            Defaults to a one-hour sale. Times are local.
          </p>
          <label>
            Product ID
            <input
              required
              pattern="[^:]+"
              value={saleProductId}
              onChange={(e) => setSaleProductId(e.target.value)}
            />
          </label>
          <label>
            Start time
            <input
              required
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>
          <label>
            End time
            <input
              required
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>
          <button disabled={saleResult.pending}>
            {saleResult.pending ? "Creating…" : "Create Flash Sale"}
          </button>
          <Feedback result={saleResult} />
        </form>
        <form onSubmit={handlePurchaseSubmit}>
          <span className="step">03</span>
          <h2>Purchase Product</h2>
          <p className="description">
            Purchase one unit during the active sale.
          </p>
          <label>
            Product ID
            <input
              required
              pattern="[^:]+"
              value={purchaseProductId}
              onChange={handlePurchaseProductIdChange}
            />
          </label>
          <label>
            User ID
            <input
              required
              pattern="[^:]+"
              value={userId}
              onChange={handleUserIdChange}
            />
          </label>
          <label>
            Idempotency Key
            <input
              required
              pattern="[^:]+"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              aria-describedby="idempotency-key-help"
            />
          </label>
          <p id="idempotency-key-help" className="hint">
            Automatically generated. Reuse this key to retry the same purchase,
            or edit it to demo a different request.
          </p>
          <button disabled={purchaseResult.pending}>
            {purchaseResult.pending ? "Purchasing…" : "Purchase Product"}
          </button>
          <Feedback result={purchaseResult} />
        </form>
      </div>
      <p className="hint">
        Create a product first to replace the sample product IDs automatically.
      </p>
      <FlashSalesTable
        key={createdProductId}
        productId={createdProductId}
        revision={salesRevision}
      />
      <TransactionsTable revision={transactionsRevision} />
    </main>
  );
}

export default App;
