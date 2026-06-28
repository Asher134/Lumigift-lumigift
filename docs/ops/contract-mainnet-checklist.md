# Contract Mainnet Deployment Checklist

Pre-deployment security gates that must all pass before the escrow contract is deployed to Stellar mainnet.

---

## 1. Audit Status

- [ ] Independent smart contract audit completed by external auditor
- [ ] All CRITICAL and HIGH findings resolved; remaining findings accepted with documented justification
- [ ] Audit report committed to `docs/audit/` and linked in the PR
- [ ] `cargo audit --deny vulnerability` passes with zero HIGH/CRITICAL CVEs
- [ ] `npm audit --audit-level=high` passes with zero high/critical advisories
- [ ] Mutation testing score meets threshold (`docs/mutation-score.md`)

## 2. Signer Key Distribution

- [ ] Multisig signer set defined (minimum 3 signers for 2-of-3 threshold)
- [ ] Each signer key generated on an air-gapped device or hardware wallet
- [ ] No single person holds more than one signer key
- [ ] Signer public keys recorded in deployment config and verified by each signer
- [ ] Threshold value reviewed and approved by engineering lead (minimum 2-of-N)
- [ ] Key recovery procedure documented and tested (e.g. Shamir secret sharing)

## 3. Amount Limits Review

- [ ] `DEFAULT_MIN_AMOUNT` and `DEFAULT_MAX_AMOUNT` reviewed for mainnet suitability
- [ ] Limits cross-referenced with payment provider constraints (Paystack/Stripe)
- [ ] Process documented for updating limits post-deployment via `execute_set_amount_limits`
- [ ] Limits tested end-to-end on testnet with boundary values

## 4. Emergency Pause Plan

- [ ] Pause mechanism tested on testnet: `propose_admin_op(Pause)` + `approve_admin_op`
- [ ] Unpause mechanism tested on testnet
- [ ] Pause monitoring alert configured (detect `paused` event on-chain)
- [ ] Incident response runbook includes pause trigger criteria:
  - Exploit detected or reported
  - Abnormal transaction volume (>10x baseline in 1 hour)
  - Dependency vulnerability with known exploit
- [ ] Emergency contact list for all signers (phone + secondary channel)
- [ ] Maximum pause duration policy defined (e.g. 72 hours before public communication)

## 5. Contract Build Verification

- [ ] Contract built with release profile: `stellar contract build`
- [ ] WASM hash matches between local build and CI artifact
- [ ] Contract size within Soroban limits
- [ ] All contract tests pass: `cargo test` in CI (green on `main`)
- [ ] Fuzz tests pass: proptest suite completes without panic

## 6. Deployment Execution

- [ ] Deployment initiated via `contract-deploy-mainnet.yml` (manual dispatch)
- [ ] Confirmation string `deploy-mainnet` entered
- [ ] GitHub environment `mainnet-deploy` approval obtained from 2 reviewers
- [ ] Post-deployment smoke test passes
- [ ] Contract ID recorded in `deployments/mainnet.json` and committed
- [ ] `STELLAR_ESCROW_CONTRACT_ID` updated in production secrets manager

## 7. Post-Deployment Validation

- [ ] `get_state()` responds on mainnet (returns `NotInitialized` for fresh contract)
- [ ] Contract visible on Stellar Expert mainnet explorer
- [ ] Monitoring dashboard updated with mainnet contract ID
- [ ] Migration runbook reviewed: `docs/ops/contract-migration.md`

---

## Sign-off

All gates above must be checked before proceeding. Minimum two engineering leads must sign off.

| Gate | Reviewer | Date | Approved |
|------|----------|------|----------|
| Audit status | | | ☐ |
| Signer key distribution | | | ☐ |
| Amount limits | | | ☐ |
| Emergency pause plan | | | ☐ |
| Build verification | | | ☐ |
| Deployment execution | | | ☐ |
| Post-deployment validation | | | ☐ |
