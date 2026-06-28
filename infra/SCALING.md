# Auto-scaling

The ECS Fargate service uses AWS Application Auto Scaling with two policies:

| Policy | Metric | Target | Scale-out | Scale-in |
|--------|--------|--------|-----------|----------|
| CPU | `ECSServiceAverageCPUUtilization` | 60 % | 60 s | 300 s |
| Requests | `ALBRequestCountPerTarget` | 1 000 req/min | 60 s | 300 s |

**Replicas:** min 2, max 10.

## Validating scaling in staging

```bash
# 1. Apply terraform to staging
terraform workspace select staging
terraform apply -var-file=staging.tfvars

# 2. Run the bundled k6 load test (requires k6 installed)
k6 run load-tests/combined.k6.js \
  --env BASE_URL=https://staging.lumigift.app

# 3. Watch the HPA equivalent — ECS task count
watch -n 5 "aws ecs describe-services \
  --cluster lumigift-staging \
  --services lumigift-staging \
  --query 'services[0].{desired:desiredCount,running:runningCount,pending:pendingCount}'"
```

Scale-out should trigger within ~60 s of CPU breaching 60 % or request rate exceeding 1 000 req/min per task.
Scale-in will not fire for at least 5 minutes after load drops to prevent flapping.
