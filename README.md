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

# Prefetch: 500

| Run | Profile | Avg accepted/s | P99 admit | Avg DB completion/s | P95 completion | P99 completion | Node CPU avg | Node CPU peak | Node memory avg | Node memory peak | Redis CPU avg | Redis memory avg | P95 pool acquire | P95 row lock wait |
| --- | ------- | -------------: | --------: | ------------------: | -------------: | -------------: | -----------: | ------------: | --------------: | ---------------: | ------------: | ---------------: | ---------------: | ----------------: |
| 1   | light   |        1,732.2 |     0.260 |               514.7 |         46.246 |         46.943 |          36% |           93% |             126 |              186 |           20% |         21.34 MB |            2.245 |             0.106 |
| 2   | medium  |        1,756.4 |     1.302 |               540.5 |         48.680 |         49.062 |          36% |           79% |             153 |              284 |           20% |         23.79 MB |            2.232 |             0.092 |
| 3   | heavy   |        1,286.0 |     3.051 |               579.0 |         48.369 |         48.581 |          22% |           80% |             148 |              266 |           18% |         26.70 MB |            2.255 |             0.096 |

# Prefetch: 0

Selected metrics from the latest three runs. Times are in seconds, rates are per second, memory is in MB, and CPU values are percentages.

| Run | Profile | Avg accepted/s | P99 admit | Avg DB completion/s | P95 completion | P99 completion | Node CPU avg | Node CPU peak | Node memory avg | Node memory peak | Redis CPU avg | Redis memory avg | P95 pool acquire | P95 row lock wait |
| --- | ------- | -------------: | --------: | ------------------: | -------------: | -------------: | -----------: | ------------: | --------------: | ---------------: | ------------: | ---------------: | ---------------: | ----------------: |
| 1   | light   |        2,145.8 |     0.235 |               593.2 |         41.287 |         41.706 |          47% |           83% |             158 |              208 |           22% |         50.50 MB |           23.977 |             0.081 |
| 2   | medium  |        1,725.6 |     0.730 |               547.9 |         48.178 |         48.494 |          31% |           94% |             150 |              285 |           18% |         52.38 MB |           36.230 |             0.096 |
| 3   | heavy   |        1,511.0 |     3.966 |               606.4 |         54.549 |         54.666 |          24% |           72% |             144 |              323 |           17% |         57.26 MB |           41.772 |             0.089 |

## Analysis

Across these runs, completion throughput remains around 500–600 purchases per second while heavier load increases latency.We are able to accept/reject requests very fast, so the bottleneck then is the rest of the workflow which is completing the purchase.

We tested to see if RabbitMQ is "too slow" by making the prefetch unbound (Prefetch: 0). Overall performance did not increase. If anything, it got slightly worse. Looking at the P95 pool acquire stat of the Prefetch: 0 table, we can see that the requests are taking a very long time

With unlimited prefetch (Prefetch:0), substantial waiting accumulates in the worker’s database connection pool (see P95 pool acquire of Prefetch 0).

Firstly, testing shows that the database always converged to a correct state towards the end of the test (i.e. stock 0 for product, and matching number of transactions, no duplicate transactions, only one product poorchase per user).

P99 latency degrades over heavier loads. Looking at the P95 pool acquire of Prefetch: 500, we can see that the main bottlenek is waiting for a connection pool from the database. I tested increasing the connection pool and it always simply maxed out everytime as well. This means that the database is simply not fast enough to handled heavier loads. To scale the system out, the first recommendation would be to scale out writes with the database. For example, a common technique would be to shard out the database. We could have 3 DB instances that each hold a number of stock, and requests could now be routed to multiple databases.

What is interesting note is that Prefetch: 500 has better P99 latency. This shows that controlling the rate at which the database receives messages can improve performance because there is not an unbounded thundering herd waiting on the database. However, a
