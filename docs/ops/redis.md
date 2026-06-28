# Redis Operations

## Configuration

Redis is configured in a **High Availability (HA) Sentinel Cluster** to eliminate single points of failure.

### Persistence

Redis is configured with **AOF (Append Only File)** persistence to prevent job queue data loss on restart.

| Setting | Value | Reason |
|---------|-------|--------|
| `appendonly` | `yes` | Enables AOF persistence |
| `maxmemory` | `256mb` | Prevents Redis from consuming all system memory |
| `maxmemory-policy` | `allkeys-lru` | Automatically evicts least recently used keys when memory limit is reached |
| `dir` | `/data` | Persistent volume mount point |

### HA Setup (Sentinel)

The cluster consists of:
- **1 Master node** (`redis`)
- **1 Replica node** (`redis-replica`)
- **3 Sentinel nodes** (`redis-sentinel-1`, `redis-sentinel-2`, `redis-sentinel-3`)

Sentinels monitor the master and automatically promote the replica if the master fails.

## Running locally

```bash
# Start the HA cluster
docker compose up -d redis redis-replica redis-sentinel-1 redis-sentinel-2 redis-sentinel-3
```

The application connects to the Sentinels to discover the current master.

## Monitoring

Redis metrics are exposed via `redis-exporter` at `http://localhost:9121/metrics`.

## Testing Failover

To verify automatic failover:

1. **Check current master:**
   ```bash
   docker compose exec redis-sentinel-1 redis-cli -p 26379 sentinel get-master-addr-by-name mymaster
   ```

2. **Pause the master node:**
   ```bash
   docker compose pause redis
   ```

3. **Monitor sentinel logs:**
   ```bash
   docker compose logs -f redis-sentinel-1
   ```
   You should see `+sdown`, `+odown`, and eventually `+switch-master`.

4. **Verify new master:**
   ```bash
   docker compose exec redis-sentinel-1 redis-cli -p 26379 sentinel get-master-addr-by-name mymaster
   ```
   It should now point to the IP of the replica.

5. **Unpause the old master:**
   ```bash
   docker compose unpause redis
   ```
   The old master will rejoin the cluster as a replica of the new master.

## Recovery procedure

If Redis data is lost or corrupted:

1. **Stop the application** to prevent new jobs from being enqueued.

2. **Check AOF file integrity:**
   ```bash
   docker compose exec redis redis-check-aof /data/appendonly.aof
   ```
   If corrupted, repair it:
   ```bash
   docker compose exec redis redis-check-aof --fix /data/appendonly.aof
   ```

3. **Restart Redis** — it will replay the AOF log automatically:
   ```bash
   docker compose restart redis
   ```

4. **Verify queued jobs** are restored, then restart the application.

5. **For total data loss** (no AOF file): queued unlock jobs must be reconstructed from the PostgreSQL `gifts` table. Query for gifts with `status = 'locked'` and `unlock_at > NOW()` and re-enqueue them manually.

---

## Manual Failover Runbook

Use this runbook when Sentinel has **not** automatically elected a new master (e.g., split-brain, network partition, or all three Sentinels are unhealthy).

### Prerequisites

- Access to the Docker host or ECS cluster running the Sentinel containers
- `redis-cli` available (or use `docker compose exec`)

### Step 1 — Identify the current master

```bash
docker compose exec redis-sentinel-1 \
  redis-cli -p 26379 sentinel get-master-addr-by-name mymaster
# Expected output: <ip> <port>
```

If this returns `(error)` or hangs, proceed to Step 2.

### Step 2 — Check Sentinel quorum

```bash
for s in redis-sentinel-1 redis-sentinel-2 redis-sentinel-3; do
  echo "=== $s ==="
  docker compose exec "$s" redis-cli -p 26379 sentinel ckquorum mymaster
done
# All three should return: OK 3 usable Sentinels. Quorum and failover authorization can be reached
```

If quorum cannot be reached (fewer than 2 Sentinels healthy), bring up failed Sentinel containers before proceeding.

### Step 3 — Force a manual failover

Run this from **any healthy Sentinel**:

```bash
docker compose exec redis-sentinel-1 \
  redis-cli -p 26379 sentinel failover mymaster
# Returns: OK
```

Wait 10–15 seconds for the election to complete, then re-run Step 1 to confirm the new master.

### Step 4 — Verify application connectivity

```bash
# Confirm the application is reading the new master from Sentinel
docker compose logs app --tail=50 | grep -i "sentinel\|master\|redis"
```

### Step 5 — Restart stalled BullMQ workers (if needed)

If BullMQ jobs stalled during the failover window:

```bash
# Check for stalled jobs in the app logs
docker compose logs app --tail=100 | grep -i "stalled\|bull"

# Restart the app container to reconnect BullMQ to the new master
docker compose restart app
```

### Step 6 — Post-failover validation

```bash
# Confirm the old master rejoined as a replica
docker compose exec redis-sentinel-1 \
  redis-cli -p 26379 sentinel replicas mymaster
```

All replica entries should show `flags: slave` (not `s_down` or `o_down`).

### Alerting

Redis Sentinel role-change events are exposed via `redis-exporter` at `:9121/metrics`.

Configure a Prometheus alert or CloudWatch metric filter on:

- **Prometheus**: `redis_sentinel_master_ok{master_name="mymaster"} == 0`
- **CloudWatch Logs Insights** (ECS): filter for `+switch-master` in `/ecs/lumigift-prod` log group

Example CloudWatch metric filter pattern:

```
[timestamp, pid, level="*", event="+switch-master", ...]
```

Create an SNS alarm on this metric with a threshold of ≥ 1 occurrence in a 1-minute window to receive immediate notification on every master failover.
