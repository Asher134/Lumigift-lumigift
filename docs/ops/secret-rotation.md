# NEXTAUTH_SECRET — AWS Secrets Manager Rotation

_Owner: Backend / DevOps team_
_Rotation cadence: every 90 days (automatic) or immediately on suspected compromise_

---

## Overview

`NEXTAUTH_SECRET` signs all NextAuth session JWTs.  It is stored in
**AWS Secrets Manager** and injected into the ECS task at runtime via the
`secrets` block in `taskdef.json` — never as a plaintext environment variable.

Zero-downtime rotation is supported by `src/lib/jwt-rotation.ts`:
the app accepts tokens signed with the **previous** secret for a configurable
grace window (`NEXTAUTH_ROTATION_GRACE_HOURS`, default 24 h) while issuing new
tokens with the current secret.

---

## ECS Task Definition (ARN reference)

In `taskdef.json` the secret is referenced by ARN, not value:

```json
{
  "name": "NEXTAUTH_SECRET",
  "valueFrom": "arn:aws:secretsmanager:<REGION>:<ACCOUNT>:secret:lumigift/prod/NEXTAUTH_SECRET"
}
```

ECS fetches the current secret value at task launch.  The execution role
(`lumigift-prod-ecs-execution`) must have:

```json
{
  "Effect": "Allow",
  "Action": ["secretsmanager:GetSecretValue"],
  "Resource": "arn:aws:secretsmanager:<REGION>:<ACCOUNT>:secret:lumigift/prod/NEXTAUTH_SECRET*"
}
```

---

## Automatic 90-Day Rotation via Lambda

### 1. Create the rotation Lambda

```bash
# Package the rotation function
zip rotation.zip rotation_lambda.py

aws lambda create-function \
  --function-name lumigift-nextauth-secret-rotation \
  --runtime python3.12 \
  --role arn:aws:iam::<ACCOUNT>:role/lumigift-secrets-rotation \
  --handler rotation_lambda.lambda_handler \
  --zip-file fileb://rotation.zip \
  --region <REGION>
```

The Lambda must implement the four Secrets Manager rotation steps
(`createSecret`, `setSecret`, `testSecret`, `finishSecret`).
A minimal implementation:

```python
# rotation_lambda.py
import boto3, os, secrets, base64

def lambda_handler(event, context):
    arn   = event["SecretId"]
    token = event["ClientRequestToken"]
    step  = event["Step"]
    client = boto3.client("secretsmanager")

    if step == "createSecret":
        # Generate a new 32-byte base64 secret
        new_secret = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()
        client.put_secret_value(
            SecretId=arn,
            ClientRequestToken=token,
            SecretString=new_secret,
            VersionStages=["AWSPENDING"],
        )

    elif step == "setSecret":
        # Nothing to propagate externally — ECS picks it up on next task start
        pass

    elif step == "testSecret":
        # Verify the pending secret can be retrieved
        client.get_secret_value(SecretId=arn, VersionStage="AWSPENDING")

    elif step == "finishSecret":
        # Promote AWSPENDING → AWSCURRENT
        meta = client.describe_secret(SecretId=arn)
        current_version = next(
            v for v, stages in meta["VersionIdsToStages"].items()
            if "AWSCURRENT" in stages
        )
        client.update_secret_version_stage(
            SecretId=arn,
            VersionStage="AWSCURRENT",
            MoveToVersionId=token,
            RemoveFromVersionId=current_version,
        )
```

### 2. Grant Secrets Manager permission to invoke the Lambda

```bash
aws lambda add-permission \
  --function-name lumigift-nextauth-secret-rotation \
  --statement-id SecretsManagerInvoke \
  --action lambda:InvokeFunction \
  --principal secretsmanager.amazonaws.com \
  --region <REGION>
```

### 3. Enable automatic rotation on the secret

```bash
aws secretsmanager rotate-secret \
  --secret-id lumigift/prod/NEXTAUTH_SECRET \
  --rotation-lambda-arn arn:aws:lambda:<REGION>:<ACCOUNT>:function:lumigift-nextauth-secret-rotation \
  --rotation-rules AutomaticallyAfterDays=90 \
  --region <REGION>
```

Secrets Manager will now rotate the secret every 90 days automatically.

---

## Grace Period — Zero-Downtime Rotation

`src/lib/jwt-rotation.ts` implements a dual-secret decode strategy:

1. **Encode** — always uses the current `NEXTAUTH_SECRET` immediately.
2. **Decode** — tries `NEXTAUTH_SECRET` first; on failure falls back to
   `NEXTAUTH_SECRET_PREVIOUS` if the token was issued within
   `NEXTAUTH_ROTATION_GRACE_HOURS` (default 24 h).

### Manual rotation procedure (covers the grace window)

```
1. Generate a new secret:
     openssl rand -base64 32

2. In Secrets Manager (or .env for staging):
     NEXTAUTH_SECRET_PREVIOUS = <current value>
     NEXTAUTH_SECRET          = <new value>

3. Deploy — sessions signed with the old secret remain valid for 24 h.

4. After NEXTAUTH_ROTATION_GRACE_HOURS have passed, clear NEXTAUTH_SECRET_PREVIOUS.
```

The automatic rotation Lambda does **not** set `NEXTAUTH_SECRET_PREVIOUS`.
For zero-downtime automatic rotation, add a post-rotation step to your Lambda
that copies the outgoing `AWSCURRENT` value into a companion secret
`lumigift/prod/NEXTAUTH_SECRET_PREVIOUS`, then redeploy or force a task
replacement so the ECS task picks up the updated `NEXTAUTH_SECRET_PREVIOUS`.

> Alternatively, configure `NEXTAUTH_ROTATION_GRACE_HOURS=0` if your deployment
> pipeline replaces all running tasks within the rotation window (blue/green).

---

## Verifying the Current Secret

```bash
# Retrieve current value (audit only — do not log or share output)
aws secretsmanager get-secret-value \
  --secret-id lumigift/prod/NEXTAUTH_SECRET \
  --query SecretString \
  --output text \
  --region <REGION>

# Check rotation status
aws secretsmanager describe-secret \
  --secret-id lumigift/prod/NEXTAUTH_SECRET \
  --region <REGION> \
  | jq '{RotationEnabled, LastRotatedDate, NextRotationDate}'
```

---

## Incident Response — Immediate Rotation

If `NEXTAUTH_SECRET` is suspected compromised:

1. Rotate immediately:
   ```bash
   aws secretsmanager rotate-secret \
     --secret-id lumigift/prod/NEXTAUTH_SECRET \
     --rotate-immediately \
     --region <REGION>
   ```
2. Force a new ECS deployment to pick up the new secret:
   ```bash
   aws ecs update-service \
     --cluster lumigift-prod \
     --service lumigift-app \
     --force-new-deployment \
     --region <REGION>
   ```
3. All existing sessions are immediately invalidated (users must re-login).
4. Log the incident in `docs/ops/key-rotation-log.md`.

---

## Related Files

| File | Purpose |
|------|---------|
| `src/lib/jwt-rotation.ts` | Dual-secret decode with grace window |
| `taskdef.json` | ECS task — secrets injected by ARN |
| `docs/secret-rotation.md` | Full secrets inventory and rotation policy |
| `docs/ops/secrets-manager.md` | General Secrets Manager integration |
