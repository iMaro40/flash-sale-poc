# Flash Sale

A flash-sale application with a TypeScript/Express backend, React frontend, PostgreSQL, Redis, and RabbitMQ.

## Prerequisites

- Node.js
- pnpm `8.10.2` or compatible
- Docker Desktop with Docker Compose

## Run From the Root

All commands below should be run from the repository root.

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Start PostgreSQL, Redis, RabbitMQ, and the background workers:

   ```sh
   pnpm docker:up
   ```

3. Run the database migrations:

   ```sh
   pnpm db:migrate
   ```

4. Start the backend in one terminal:

   ```sh
   pnpm backend
   ```

   The API runs at `http://localhost:3000`.

5. Start the frontend in a second terminal:

   ```sh
   pnpm frontend
   ```

   Open the local URL printed by Vite, usually `http://localhost:5173`.

The frontend proxies `/api` requests to the backend. The backend uses the Docker services configured in `docker-compose.yml` by default.

## Tests and Checks

Run backend unit tests:

```sh
pnpm test
```

Run integration tests after starting the Docker services and applying migrations:

```sh
pnpm test:integration:setup
```

## Architecture Diagram

```mermaid
flowchart LR
    Frontend[React Frontend] --> API[Node.js API + Rate Limiter]
    API -->|Reserve stock| Redis[(Redis)]
    API -->|Create pending purchase| DB[(PostgreSQL)]
    API --> Queue[RabbitMQ]
    Queue --> Worker[Purchase Worker]
    Worker -->|Complete purchase| DB
    Redis -.-|Update reservation| Worker
    Queue -->|Failed messages| DLQ[Dead-letter Queue]
    Reconciler[Reconciliation Worker] -->|Cancel stale purchases| DB
    Redis -.-|Release reservation| Reconciler
```

The API returns `202 Accepted` after submitting a purchase for processing. The frontend polls for its final status. The purchase flow below explains transaction locking, retries, and reservation handling.

### Components and Responsibilities

| Component                | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React frontend           | Submits purchases and polls transaction status every three seconds because purchase completion is asynchronous.                                                                                                                                                                                                                                                                                                                                                                         |
| Gateway / rate limiter   | Redis-backed, per-IP rate limiting implemented as Express middleware. No load balancer for this assignment because stress tests revealed that the first main bottleneck is the DB.                                                                                                                                                                                                                                                                                                      |
| Node.js purchase service | Reserves stock in Redis, creates a pending transaction in PostgreSQL, and publishes the purchase to RabbitMQ. Immediate acceptance of HTTP request without waiting for purchase completion.                                                                                                                                                                                                                                                                                             |
| Redis                    | Fast-admission control layer. Uses an atomic Lua script to quickly check sale eligibility, buyer/idempotency state, and available stock, then decrement stock and record the reservation. This lets invalid purchase requests be quickly rejected without ever hitting the DB. Now stock management becomes more complicated, but the system will be performant.                                                                                                                        |
| RabbitMQ                 | Buffers accepted purchases in the durable `purchase.process` queue. Allows us to control the rate of requests coming in to the DB. The tradeoff is now we need a separate reconciliation worker to account for potential failed messages or unexpected RabbitMQ failures that leave a transaction stuck in pending. Another tradeoff is user experience: users cannot immediately know their transaction status and must poll or something to find out what happened to their requests. |
| PostgreSQL               | Relational database since we have a bunch of relational data models. Stores transaction status and product stock. Unique constraints, seralized stock updates, and transaction row locking ensure correctness, will always ensure system correctness as the "last line of defense".                                                                                                                                                                                                     |
| Dead-letter queue        | Receives rejected messages through `purchase.process.dlx` into `purchase.process.dlq` for failure visibility.                                                                                                                                                                                                                                                                                                                                                                           |
| Reconciliation worker    | It is highly possible that some transactions get stuck in PENDING because of some failure mode (RabbitMQ failing to publish message, DB timeout, etc.). We use a periodic job to cancel any PENDING transactions stuck in PENDING for > 10 minutes to release the stuck stock.                                                                                                                                                                                                          |

### Purchase Flow

1. The frontend submits a purchase request with a buyer, product, and idempotency key.
2. Rate-limit middleware checks the request before it reaches the purchase service. The configured limit is deliberately high for stress testing.
3. Redis atomically checks the sale window, buyer state, and stock. A valid request decrements Redis stock and creates pending buyer/reservation markers.
4. The API creates a `PENDING` transaction in PostgreSQL and sends its ID and purchase input to RabbitMQ. It returns HTTP `202 Accepted`; this means queued for processing, not completed.
5. The consumer locks the transaction row with `FOR UPDATE`. A `COMPLETED` transaction is treated as already processed; a `CANCELLED` transaction is rejected. Otherwise, it decrements database stock and marks the transaction `COMPLETED` in the same database transaction.
6. After the database commit, the service attempts to mark the Redis reservation as completed, and the consumer acknowledges the message. The frontend discovers the final status through polling.

### High Throughput & Scalability

1. Using Redis, we can quickly accept and reject transactions without ever hitting Postgres.
2. Using RabbitMQ, we can tune prefetch and number of consumers to match DB apacity.
3. No load balancer was used in this assignment since we are able to quickly process HTTP requests, but this is definitely easily implementable if the servers start becoming the bottleneck.

### Robustness & Fault Tolerance

1. Separate reconciliation worker created to ensure stock integrity in case of RabbitMQ failures or other failures
2. RabbitMQ controls the rate of which Postgres receives requests. This ensures Postgres does not receive requests beyond its capacity.
3. Database fallback in case Redis is down. However do note, that it is not configured for complete atomicity like Redis to make it at least a bit more performant. The down side is that excess requests might go through and the database will have to reject them later on
4. Retries are configured for retryable errors
5. Release stock if DB transaction rolls back

### Concurrency Control

1. Unique constraints in Postgres are used ensure our core requirements. (e.g. no transactions for same idempotency key, no user can make more than one purchase for the same product)
2. Row lock to prevent retries from potentially deducting stock twice
3. Robust Lua script in Redis to ensure that only valid purchase requests go through.

### Stress Test

## Results

The tests were done with:
10s ramp-up
5s spike
20s sustained load
5s ramp-down

The number of virtual users and stock are proportional to the test profiles: light, medium or heavy. We tested with prefetch 0, meaning RabbitMQ is unbound, and prefetch 500, where RabbitMQ can only have 500 unacked messages at a time.

Times are in seconds, rates are per second, memory is in MB, and CPU values are percentages.

# Prefetch: 500, Max connections: 10

| Run | Profile | Avg accepted/s | P99 admit | Avg DB completion/s | P95 completion | P99 completion | Node CPU avg | Node CPU peak | Node memory avg | Node memory peak | Redis CPU avg | Redis memory avg | P95 pool acquire | P95 row lock wait |
| --- | ------- | -------------: | --------: | ------------------: | -------------: | -------------: | -----------: | ------------: | --------------: | ---------------: | ------------: | ---------------: | ---------------: | ----------------: |
| 1   | light   |        1,772.2 |     0.206 |               583.3 |         37.904 |         38.198 |          48% |           87% |             165 |              190 |           21% |         30.44 MB |            1.821 |             0.071 |
| 2   | medium  |        2,095.1 |     0.679 |               634.9 |         42.960 |         43.257 |          46% |          100% |             255 |              350 |           21% |         30.13 MB |            1.683 |             0.072 |
| 3   | heavy   |        2,313.0 |     2.251 |               780.8 |         46.291 |         46.613 |          39% |           88% |             329 |              442 |           20% |         30.46 MB |            1.525 |             0.061 |

# Prefetch: 0, Max connections: 10

| Run | Profile | Avg accepted/s | P99 admit | Avg DB completion/s | P95 completion | P99 completion | Node CPU avg | Node CPU peak | Node memory avg | Node memory peak | Redis CPU avg | Redis memory avg | P95 pool acquire | P95 row lock wait |
| --- | ------- | -------------: | --------: | ------------------: | -------------: | -------------: | -----------: | ------------: | --------------: | ---------------: | ------------: | ---------------: | ---------------: | ----------------: |
| 1   | light   |        2,145.8 |     0.235 |               593.2 |         41.287 |         41.706 |          47% |           83% |             158 |              208 |           22% |         50.50 MB |           23.977 |             0.081 |
| 2   | medium  |        1,725.6 |     0.730 |               547.9 |         48.178 |         48.494 |          31% |           94% |             150 |              285 |           18% |         52.38 MB |           36.230 |             0.096 |
| 3   | heavy   |        1,511.0 |     3.966 |               606.4 |         54.549 |         54.666 |          24% |           72% |             144 |              323 |           17% |         57.26 MB |           41.772 |             0.089 |

# Prefetch: 0, Max connections: 20

| Run | Profile | Avg accepted/s | P99 admit | Avg DB completion/s | P95 completion | P99 completion | Node CPU avg | Node CPU peak | Node memory avg | Node memory peak | Redis CPU avg | Redis memory avg | P95 pool acquire | P95 row lock wait |
| --- | ------- | -------------: | --------: | ------------------: | -------------: | -------------: | -----------: | ------------: | --------------: | ---------------: | ------------: | ---------------: | ---------------: | ----------------: |
| 1   | light   |        1,904.6 |     0.226 |               564.5 |         42.883 |         43.313 |          43% |           88% |             168 |              196 |           18% |         21.22 MB |           25.832 |             0.197 |
| 2   | medium  |        1,643.1 |     0.919 |               579.7 |         43.768 |         43.931 |          34% |           82% |             210 |              294 |           17% |         22.94 MB |           34.736 |             0.217 |
| 3   | heavy   |        1,478.8 |     2.632 |               662.8 |         45.275 |         45.799 |          27% |           88% |             198 |              313 |           15% |         29.96 MB |           39.085 |             0.216 |

## Analysis

Firstly, testing showed that the database always converged to a correct state towards the end of the test (i.e. stock 0 for product, and matching number of transactions, no duplicate transactions, only one product poorchase per user). All tested runs proved integrity constraints of the requirement.

Across these runs, completion throughput remains around 500–670 purchases per second while heavier load increases latency. We are also able to accept/reject requests very fast, so the bottleneck then is the rest of the workflow which is completing the purchase.

Given this, to try and empirically isolate the bottleneck, we first tested to see if RabbitMQ is sending messages too slow by making the prefetch unbound (Prefetch: 0). Looking at the Pre Fetch 0 results, overall throughput did somewhat increase, but the latency became much worse for the heavy loads. Looking at the P95 pool acquire stat of the Prefetch: 0 table, we can see that the requests are taking a very long time to acquire a connection.

Increasing the max. connections did not seem to increase over all performance. If anything, it became a bit worse. These all suggest that the database is the bottleneck. It is simply unable to keep up with the number of requests coming in.

For recommendations of scaling out, we can first try to increease the hardware specs of the DB to see if performance improves. Another common solution would be to scale out our write requests through sharding. For example, we could shard with multiple databases and each one holding a certain amount of stock of a product. This way, multiple db instances can support purchase requests for the same product.
