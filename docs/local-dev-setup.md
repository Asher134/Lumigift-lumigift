# Local Development Setup Guide

Follow this numbered checklist top-to-bottom. Each step shows the expected output so you can verify success before moving on.

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 20 | [nodejs.org](https://nodejs.org) |
| npm | 10 | bundled with Node.js |
| Git | any | [git-scm.com](https://git-scm.com) |
| Docker & Docker Compose | any | [docs.docker.com](https://docs.docker.com/get-docker/) |
| Rust + Cargo | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` |
| Stellar CLI | latest | [Stellar CLI docs](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli) |

> **Windows users:** all commands assume **WSL 2** (Ubuntu 22.04 recommended).  
> Install WSL: `wsl --install` in an elevated PowerShell, then reopen a WSL terminal.

---

## Onboarding Checklist

### Step 1 — Clone the repository

```bash
git clone https://github.com/JosephOnuh/Lumigift-lumigift.git
cd Lumigift-lumigift
```

**Expected output:** A new directory `Lumigift-lumigift/` is created and you are inside it.

---

### Step 2 — Install Node dependencies

```bash
npm install
```

**Expected output:** `added N packages` with no `ERR!` lines. A `node_modules/` directory appears.

> If you see `ERESOLVE` errors, try `npm install --legacy-peer-deps`.

---

### Step 3 — Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` in your editor and fill in **every required variable** listed below.

#### 3a. Core app

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
CSRF_SECRET=<run: openssl rand -base64 32>
```

> **`CSRF_SECRET` is required.** The app will fail to start without it. Generate it with `openssl rand -base64 32`.

#### 3b. Database

```env
DATABASE_URL=postgresql://lumigift:lumigift@localhost:5432/lumigift
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_IDLE_TIMEOUT_MS=10000
DB_CONNECTION_TIMEOUT_MS=5000
```

#### 3c. Redis

```env
REDIS_URL=redis://localhost:6379
```

#### 3d. Stellar testnet

```env
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SERVER_SECRET_KEY=<your testnet secret key — see Step 5>
STELLAR_ESCROW_CONTRACT_ID=<deployed contract id — see Step 7>
USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
USDC_ASSET_CODE=USDC
```

#### 3e. Paystack sandbox

```env
PAYSTACK_SECRET_KEY=sk_test_<your_key>
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_<your_key>
```

#### 3f. SMS (Termii)

```env
TERMII_API_KEY=<your_termii_api_key>
TERMII_SENDER_ID=Lumigift
```

#### 3g. Cron secret

```env
CRON_SECRET=<run: openssl rand -base64 32>
```

#### 3h. Cloudinary (optional)

```env
CLOUDINARY_CLOUD_NAME=<your_cloud_name>
CLOUDINARY_API_KEY=<your_api_key>
CLOUDINARY_API_SECRET=<your_api_secret>
```

**Expected output:** `.env.local` exists with no empty required fields.

---

### Step 4 — Start backing services (PostgreSQL + Redis)

```bash
# Start Redis and PostgreSQL via Docker Compose
docker compose up -d

# Verify both containers are running
docker ps
```

**Expected output:** Two containers listed — one for `redis` and one for `postgres`, both with `STATUS` = `Up`.

```
CONTAINER ID   IMAGE              STATUS
xxxxxxxxxxxx   postgres:16-alpine Up N seconds
xxxxxxxxxxxx   redis:7-alpine     Up N seconds
```

Also verify connectivity:

```bash
redis-cli ping          # → PONG
psql "$DATABASE_URL" -c '\l'   # → lists databases including lumigift
```

---

### Step 5 — Create a Stellar testnet account

```bash
# Generate a named keypair
stellar keys generate --global lumigift-dev --network testnet

# Print the public key (G…)
stellar keys address lumigift-dev

# Print the secret key (S…) — copy into STELLAR_SERVER_SECRET_KEY in .env.local
stellar keys show lumigift-dev
```

Fund the account:

```bash
stellar keys fund lumigift-dev --network testnet
```

Add a USDC trustline:

```bash
stellar tx new change-trust \
  --source-account lumigift-dev \
  --asset USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
  --network testnet \
  --sign --submit
```

**Expected output:** `stellar account show lumigift-dev --network testnet` shows a `native` balance ≥ 10 000 XLM and a `USDC` trustline entry.

---

### Step 6 — Run database migrations

```bash
for f in migrations/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

**Expected output:** Each migration prints `CREATE TABLE`, `ALTER TABLE`, or similar DDL statements with no `ERROR:` lines.

> **Duplicate migration warning:** If you see `relation "X" already exists`, the migration has already been applied — this is safe to ignore. To start fresh, drop and recreate the database:
> ```bash
> psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
> # then re-run the loop above
> ```

---

### Step 7 — Build and deploy the escrow contract *(optional for frontend-only work)*

```bash
rustup target add wasm32-unknown-unknown
npm run contract:build
npm run contract:test
STELLAR_NETWORK=testnet npm run contract:deploy
```

Copy the printed contract ID into `STELLAR_ESCROW_CONTRACT_ID` in `.env.local`.

**Expected output:** `contract:deploy` prints a contract ID starting with `C…`.

---

### Step 8 — Start the development server

```bash
npm run dev
```

**Expected output:**

```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
- Environments: .env.local
✓ Ready in Xs
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The Lumigift landing page loads without errors in the browser console.

---

### Step 9 — Verify with the test suite

```bash
npm test                  # unit tests — all should pass
npm run test:coverage     # coverage report
```

**Expected output:** `Tests: N passed, N total` with no failing tests.

---

## Common Errors

### Missing `CSRF_SECRET` — app crashes on startup

**Symptom:** The app exits immediately with `Error: CSRF_SECRET is not set` or similar.

**Fix:** Add `CSRF_SECRET` to `.env.local`:

```bash
echo "CSRF_SECRET=$(openssl rand -base64 32)" >> .env.local
```

---

### Duplicate migrations — `relation already exists`

**Symptom:** Running migrations prints `ERROR:  relation "gifts" already exists`.

**Fix:** Safe to ignore on re-runs. To apply cleanly, reset the schema first:

```bash
psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
for f in migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

---

### Redis connection refused

**Symptom:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Fix:** Start the Redis container:

```bash
docker compose up -d
redis-cli ping   # should return PONG
```

---

### PostgreSQL connection refused

**Symptom:** `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Fix:** Start (or restart) the Postgres container:

```bash
docker compose up -d
# or if using a standalone container:
docker start lumigift-postgres
```

---

### `ECONNREFUSED` in tests

Tests that hit the DB need a running Postgres. Mock `@/lib/db` in unit tests instead:

```ts
jest.mock("@/lib/db", () => ({ query: jest.fn() }));
```

---

### Stellar `op_no_trust`

Your server account does not have a USDC trustline. Re-run the `change-trust` command in Step 5.

---

### Stellar `tx_insufficient_balance`

Your testnet account is out of XLM. Re-fund:

```bash
stellar keys fund lumigift-dev --network testnet
```

---

### `next: command not found`

Run `npm install` again (or use `npx next dev`).

---

### Port 3000 already in use

```bash
lsof -ti:3000 | xargs kill -9
```

---

### WSL: Docker Desktop not running

Enable WSL integration: **Docker Desktop → Settings → Resources → WSL Integration → enable your distro**.

---

## Useful Commands Reference

```bash
npm run dev              # start Next.js dev server
npm run build            # production build
npm run lint             # ESLint
npm run type-check       # TypeScript type check
npm run format           # Prettier
npm test                 # Jest unit tests
npm run test:coverage    # with coverage report
npm run contract:build   # build Soroban WASM
npm run contract:test    # Rust tests
npm run contract:deploy  # deploy to testnet
docker compose up -d     # start backing services
docker compose down      # stop backing services
```
