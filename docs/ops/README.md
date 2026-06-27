# Operations Runbooks & Guides

This directory contains operational runbooks, deployment guides, and infrastructure documentation for Lumigift.

## Runbooks

| Document | Description |
|----------|-------------|
| [runbook.md](runbook.md) | Main incident runbook — database failures, Redis outages, Stellar degradation, Paystack webhooks, cron failures, security incidents |
| [bullmq-worker-runbook.md](bullmq-worker-runbook.md) | BullMQ worker failures — job inspection, retry/replay, queue drain before deployment, Redis failover recovery |

## Deployment

| Document | Description |
|----------|-------------|
| [blue-green-deployment.md](blue-green-deployment.md) | Zero-downtime blue/green deployment and instant rollback |
| [staging.md](staging.md) | Staging environment setup and promotion workflow |
| [stellar-mainnet-deployment.md](stellar-mainnet-deployment.md) | Deploying the Soroban escrow contract to Stellar mainnet |
| [contract-deployment.md](contract-deployment.md) | General smart contract deployment guide |
| [contract-migration.md](contract-migration.md) | Contract upgrade and migration procedures |

## Infrastructure

| Document | Description |
|----------|-------------|
| [redis.md](redis.md) | Redis Sentinel setup, AOF persistence, and failover recovery |
| [database-backup.md](database-backup.md) | PostgreSQL backup schedule and restore procedure |
| [cdn-setup.md](cdn-setup.md) | CDN configuration for media assets |
| [network-security.md](network-security.md) | Firewall rules, VPC config, and TLS setup |
| [log-aggregation.md](log-aggregation.md) | Structured logging pipeline (pino → Logtail/Betterstack) |
| [uptime-monitoring.md](uptime-monitoring.md) | Uptime checks and alerting configuration |

## Security & Secrets

| Document | Description |
|----------|-------------|
| [secrets-manager.md](secrets-manager.md) | Secrets Manager integration and secret loading at runtime |
| [secret-rotation.md](secret-rotation.md) | Secret rotation runbook and schedule |
| [key-rotation.md](key-rotation.md) | Stellar keypair and NEXTAUTH_SECRET rotation |
| [key-rotation-log.md](key-rotation-log.md) | Audit log of completed key rotations |
| [vulnerability-scanning.md](vulnerability-scanning.md) | Dependency and container vulnerability scanning |
