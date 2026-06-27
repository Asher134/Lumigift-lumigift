# Trivy CVE Exception Process

Trivy runs as a blocking step in `deploy.yml` after the Docker image is built and pushed to ECR. Any **CRITICAL** severity CVE with an available fix will fail the deployment pipeline.

---

## When a CRITICAL CVE blocks deployment

The `Scan image for CRITICAL CVEs (Trivy)` step exits with code `1` when:
- A CRITICAL CVE is found **and** a fixed version of the affected package is available.
- Unfixed-only CVEs are skipped via `ignore-unfixed: true`.

The SARIF report is always uploaded to GitHub Security → Code scanning regardless of pass/fail.

---

## Evaluating a potential false positive

1. Look up the CVE on [NVD](https://nvd.nist.gov/) and the upstream advisory.
2. Confirm whether the vulnerable code path is reachable in this application.
3. Check if an upstream fix is available — if so, upgrade rather than ignore.
4. Search [aquasecurity/trivy issues](https://github.com/aquasecurity/trivy/issues) to confirm Trivy isn't misidentifying the version or severity.

---

## Adding a `.trivyignore` entry

If the CVE is a confirmed false positive or the risk is formally accepted, add an entry to `.trivyignore` at the repository root.

```
# CVE-YYYY-NNNNN
# Reason: <one-line justification>
# Approved-by: <GitHub username>
# Expires: YYYY-MM-DD
CVE-YYYY-NNNNN
```

Expiry must be ≤ 90 days from approval. Re-evaluate before it expires.

---

## Approval process

1. Open a PR adding **only** the `.trivyignore` entry, labeled `security-exception`.
2. PR description must include: CVE ID + NVD link, justification, and expiry date.
3. A member of the **security** team must approve before merge.
