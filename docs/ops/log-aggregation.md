# Log Aggregation

Lumigift ships structured JSON logs (pino) to a centralized log management
system for search, alerting, and retention.

## Supported Backends

Set `LOG_BACKEND` to one of the following values:

| Backend | `LOG_BACKEND` | Required env vars |
|---|---|---|
| Datadog | `datadog` | `DD_API_KEY`, `DD_SITE` (default: `datadoghq.com`) |
| Grafana Loki | `loki` | `LOKI_URL` (e.g. `http://loki:3100`) |
| Generic HTTP (Logtail/Betterstack) | `http` | `LOG_AGGREGATION_URL`, `LOG_AGGREGATION_TOKEN` |
| AWS CloudWatch | `cloudwatch` | Use the CloudWatch agent sidecar (see below) |
| Stdout only | _(unset)_ | — |

All backends also write JSON to stdout so container log drivers (Docker,
ECS, Kubernetes) can capture logs independently.

## Environment Variables

```bash
# Select backend
LOG_BACKEND=datadog

# Log level (default: info in production, debug in dev)
LOG_LEVEL=info

# Datadog
DD_API_KEY=<your-api-key>
DD_SITE=datadoghq.com

# Loki
LOKI_URL=http://loki:3100

# Generic HTTP
LOG_AGGREGATION_URL=https://in.logtail.com
LOG_AGGREGATION_TOKEN=<source-token>
```

## Log Fields

Every log line includes:

| Field | Description |
|---|---|
| `correlationId` | UUID per request — use to trace a full request across services |
| `userId` | Authenticated user ID (when available) |
| `giftId` | Gift ID for gift-related operations |
| `service` | Service name (e.g. `gift-service`, `claim-service`) |
| `env` | `production` / `staging` / `development` |
| `app` | Always `lumigift` |

Sensitive fields (`phone`, `token`, `apiKey`, etc.) are redacted before
reaching any transport.

## Searching Logs

### By correlation ID
```
correlationId:"abc-123-..."
```

### By user
```
userId:"user_abc123"
```

### By gift
```
giftId:"gift_xyz789"
```

### Error rate spike
```
level:error | stats count() by bin(5m)
```

## Retention Policy

| Tier | Duration | Storage |
|---|---|---|
| Hot (searchable) | 90 days | Datadog / Loki / CloudWatch |
| Cold (archived) | 1 year | S3 / Glacier |

### Datadog
- Set index retention to 90 days in **Logs → Indexes**.
- Enable **Log Archives** to S3 for 1-year cold storage.

### Loki
- Set `retention_period: 2160h` (90 days) in `loki-config.yaml`.
- Configure S3 backend for object storage.

### CloudWatch
- Set log group retention to 90 days:
  ```bash
  aws logs put-retention-policy \
    --log-group-name /lumigift/app \
    --retention-in-days 90
  ```
- Export to S3 for cold storage using a scheduled Lambda or Data Firehose.

## CloudWatch Logs Insights

The ECS task definition sends all container logs to the `/ecs/lumigift-prod` log group
(created by Terraform with 30-day retention). Use the queries below in the
**CloudWatch → Logs Insights** console — select the `/ecs/lumigift-prod` log group.

### Saved query: trace a request by correlation ID

```
fields @timestamp, level, msg, userId, giftId, service
| filter correlationId = "<YOUR_CORRELATION_ID>"
| sort @timestamp asc
| limit 200
```

Save this in the console as **"Lumigift — Trace by correlationId"** so the team can
run it without re-typing the query each time.

### Saved query: recent errors

```
fields @timestamp, level, msg, correlationId, userId, service
| filter level = "error" or level = "fatal"
| sort @timestamp desc
| limit 100
```

Save as **"Lumigift — Recent errors"**.

### Saved query: payment failures

```
fields @timestamp, msg, correlationId, giftId, service
| filter ispresent(giftId) and (msg like /payment/ or msg like /paystack/ or msg like /stripe/)
| filter level = "error"
| sort @timestamp desc
| limit 50
```

Save as **"Lumigift — Payment errors"**.

## Alerts

Configure the following alerts in your aggregation system:

| Alert | Condition | Severity |
|---|---|---|
| Error rate spike | `error` logs > 10/min for 5 min | High |
| Fatal errors | Any `fatal` log | Critical |
| Auth failures | `event:auth_failed` > 20/min | High |
| Payment failures | `event:payment_failed` > 5/min | Medium |

### Datadog Monitor (example)
```json
{
  "name": "Lumigift error rate spike",
  "type": "log alert",
  "query": "logs(\"service:lumigift status:error\").index(\"*\").rollup(\"count\").last(\"5m\") > 10",
  "message": "@slack-lumigift-alerts Error rate spike detected"
}
```

## AWS CloudWatch Agent (ECS/EC2)

The ECS task definition (`taskdef.json`) uses the `awslogs` log driver so all
container stdout/stderr flows directly to CloudWatch Logs without a sidecar:

```json
"logConfiguration": {
  "logDriver": "awslogs",
  "options": {
    "awslogs-group":         "/ecs/lumigift-prod",
    "awslogs-region":        "<AWS_REGION>",
    "awslogs-stream-prefix": "ecs"
  }
}
```

The `/ecs/lumigift-prod` log group is provisioned by Terraform
(`infra/terraform/main.tf`) with **30-day retention**.

### Pino log level in production

The application logger (`src/lib/logger.ts`) defaults to `level: 'info'` when
`NODE_ENV=production`. Set `LOG_LEVEL=debug` in the task environment only
for short-lived debugging sessions — verbose debug logs increase CloudWatch
ingest costs and may expose sensitive context.

To temporarily raise the level on a running task, update the `LOG_LEVEL`
secret/environment variable and trigger a new ECS deployment.

If you need to add a CloudWatch agent as an additional sidecar (e.g. for
collecting system-level metrics), add it alongside the `app` container in
the task definition:

```json
{
  "name": "cloudwatch-agent",
  "image": "amazon/cloudwatch-agent:latest",
  "environment": [
    { "name": "CW_CONFIG_CONTENT", "value": "{\"logs\":{\"logs_collected\":{\"files\":{\"collect_list\":[{\"file_path\":\"/var/log/app/*.log\",\"log_group_name\":\"/lumigift/app\",\"log_stream_name\":\"{instance_id}\"}]}}}}" }
  ]
}
```

Or use the ECS FireLens log driver to route stdout directly to CloudWatch
without a sidecar.

## Dashboard

Key metrics to display:

- Request rate (req/min)
- Error rate (errors/min)
- P95 response time
- Gift creation rate
- Payment failure rate
- Auth failure rate
