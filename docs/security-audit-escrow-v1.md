# Lumigift Escrow Contract — Internal Security Audit Report

| Field | Value |
|---|---|
| **Contract** | `contracts/escrow/src/lib.rs` |
| **Version audited** | `lumigift-escrow 0.1.0` |
| **Audit type** | Internal pre-mainnet |
| **Date** | 2026-05-31 |
| **Auditor** | Lumigift Engineering |
| **Issue** | [#360](https://github.com/JosephOnuh/Lumigift-lumigift/issues/360) |
| **Status** | ✅ All critical/high findings resolved |

---

## 1. Scope

The audit covers the Soroban/Rust escrow smart contract that time-locks USDC on the Stellar network. The checklist mandated by issue #360 is:

- [x] Integer overflow
- [x] Access control
- [x] Reentrancy / CEI pattern
- [x] Storage manipulation
- [x] Event spoofing

---

## 2. Summary of Findings

| ID | Title | Severity | Status |
|---|---|---|---|
| ESC-01 | `expected_usdc` undefined — arbitrary token accepted | Critical | ✅ Fixed |
| ESC-02 | No cancel path — sender funds permanently locked | High | ✅ Fixed |
| ESC-03 | `unlock_time` not validated against current timestamp | High | ✅ Fixed |
| ESC-04 | Fuzz test calls wrong `initialize` arity | Medium | ✅ Fixed |
| ESC-05 | `AlreadyCancelled` error defined but unreachable | Low | ✅ Fixed |
| ESC-06 | Integer overflow in arithmetic | Informational | ✅ Not applicable |
| ESC-07 | Reentrancy / CEI pattern | Informational | ✅ Correct |
| ESC-08 | Access control on `claim` | Informational | ✅ Correct |
| ESC-09 | Event spoofing | Informational | ✅ Not applicable |

---

## 3. Detailed Findings

### ESC-01 — `expected_usdc` undefined (Critical) ✅ Fixed

**Location:** `initialize()`, line ~70 (pre-fix)

**Description:**  
The token whitelist check compared the caller-supplied `token` address against a variable `expected_usdc` that was never declared or assigned. This caused a compile error in the original code, but the underlying intent — rejecting non-USDC tokens — was completely absent. Without this check, an attacker could initialize the escrow with a worthless token they control, making the contract accept a fake deposit while the platform believes real USDC was locked.

**Impact:** An attacker could drain the platform by substituting a zero-value token for USDC.

**Fix:**  
`expected_usdc` is now an explicit parameter of `initialize()`. The contract stores it and compares it against `token` before accepting the deposit. A mismatch returns the new `InvalidToken` error (code 9).

```rust
// initialize now takes expected_usdc as a 7th argument
pub fn initialize(
    env: Env,
    sender: Address,
    recipient: Address,
    token: Address,
    amount: i128,
    unlock_time: u64,
    expected_usdc: Address,   // ← new
) -> Result<(), EscrowError> {
    ...
    if token != expected_usdc {
        return Err(EscrowError::InvalidToken);
    }
```

---

### ESC-02 — No cancel path — sender funds permanently locked (High) ✅ Fixed

**Location:** Contract-wide (pre-fix)

**Description:**  
There was no function allowing the sender to reclaim funds. If the recipient never calls `claim()` (lost key, wrong address, etc.) the USDC is locked in the contract forever with no recovery mechanism.

**Impact:** Permanent loss of user funds in any scenario where the recipient cannot or does not claim.

**Fix:**  
A `cancel()` function was added. It:
- Requires `sender.require_auth()` — only the original sender may cancel.
- Checks that the escrow has not already been claimed (`AlreadyClaimed`) or cancelled (`AlreadyCancelled`).
- Follows the CEI pattern: sets `Cancelled = true` in storage **before** calling `token.transfer()`.
- Emits a `cancelled` event.

```rust
pub fn cancel(env: Env) -> Result<(), EscrowError> {
    let sender: Address = env.storage().instance()
        .get(&DataKey::Sender).ok_or(EscrowError::NotInitialized)?;
    sender.require_auth();
    // guards ...
    env.storage().instance().set(&DataKey::Cancelled, &true);  // CEI
    token_client.transfer(&env.current_contract_address(), &sender, &amount);
    ...
}
```

---

### ESC-03 — `unlock_time` not validated against current timestamp (High) ✅ Fixed

**Location:** `initialize()` (pre-fix)

**Description:**  
The contract accepted any `unlock_time` value, including timestamps in the past or equal to the current ledger time. This allowed creating an escrow that was immediately claimable (unlock_time = 0) or one set to a past date, undermining the time-lock guarantee entirely.

**Impact:** The core product promise — "funds stay hidden until a surprise unlock date" — could be bypassed.

**Fix:**  
A strict future-time check is now enforced:

```rust
if unlock_time <= env.ledger().timestamp() {
    return Err(EscrowError::InvalidUnlockTime);
}
```

---

### ESC-04 — Fuzz test calls wrong `initialize` arity (Medium) ✅ Fixed

**Location:** `fuzz::test_initialize_rejects_non_usdc_token` and `fuzz_initialize_amount` (pre-fix)

**Description:**  
The fuzz test `test_initialize_rejects_non_usdc_token` called `client.initialize(...)` with 6 arguments, but the real function only accepted 5. This means the test never compiled and the token-rejection property was never actually verified. Additionally, `fuzz_initialize_amount` used `0u64..=u64::MAX` for `unlock_time`, which would generate `0` — now rejected by the new `InvalidUnlockTime` check.

**Fix:**  
All test call sites updated to the 7-argument signature. The fuzz range for `unlock_time` changed to `1u64..=u64::MAX` to stay above the ledger's initial timestamp of 0.

---

### ESC-05 — `AlreadyCancelled` error defined but unreachable (Low) ✅ Fixed

**Location:** `EscrowError` enum (pre-fix)

**Description:**  
`AlreadyCancelled = 6` was declared but no code path ever returned it, making it dead code and misleading to integrators reading the ABI.

**Fix:**  
Now returned by both `cancel()` (double-cancel) and `claim()` (claim after cancel).

---

### ESC-06 — Integer overflow (Informational) ✅ Not applicable

The `[profile.release]` section in `Cargo.toml` sets `overflow-checks = true`. All arithmetic on `i128` amounts is therefore protected at the VM level. No unchecked arithmetic was found in the contract logic.

---

### ESC-07 — Reentrancy / CEI pattern (Informational) ✅ Correct

Both `claim()` and `cancel()` follow the Checks-Effects-Interactions pattern:
1. All guards checked first.
2. State written to storage (`Claimed = true` / `Cancelled = true`).
3. External token transfer called last.

Soroban's execution model does not support mid-transaction re-entry in the same way EVM does, but the CEI pattern is maintained as defence-in-depth.

---

### ESC-08 — Access control on `claim` (Informational) ✅ Correct

`claim()` calls `recipient.require_auth()` before any state read or write. Only the address stored as `Recipient` at initialization time can trigger a claim. There is no admin override or fallback path.

---

### ESC-09 — Event spoofing (Informational) ✅ Not applicable

Events are published via `env.events().publish()` which is sandboxed to the contract's own address in Soroban. External contracts cannot emit events on behalf of this contract.

---

## 4. Audit Checklist (Issue #360)

| Checklist item | Result |
|---|---|
| Integer overflow | ✅ `overflow-checks = true`; no manual arithmetic |
| Access control | ✅ `require_auth()` on all state-mutating functions |
| Reentrancy | ✅ CEI pattern followed in `claim()` and `cancel()` |
| Storage manipulation | ✅ All keys are typed enums; no raw key collisions possible |
| Event spoofing | ✅ Not possible in Soroban's sandboxed event model |
| All critical/high findings resolved | ✅ ESC-01, ESC-02, ESC-03 fixed |
| Audit report in `/docs` | ✅ This document |
| External audit engagement planned | ⏳ Planned post-launch (see §5) |
| Contract version tagged after sign-off | ⏳ To be tagged after PR merge |

---

## 5. External Audit Plan

Before mainnet deployment, an external audit engagement should be initiated with one of the following firms that have Soroban/Rust experience:

- **OtterSec** — active Soroban auditors
- **Halborn** — Stellar ecosystem experience
- **Trail of Bits** — Rust/WASM expertise

Recommended scope for external audit:
1. Full contract logic review
2. Stellar-specific attack surface (ledger timestamp manipulation, auth context)
3. Integration review of the platform's `deploy-contract.ts` script
4. Formal verification of the CEI pattern under Soroban's execution model

---

## 6. Recommendations for Post-Audit

1. **Storage TTL** — Soroban instance storage expires. Add `env.storage().instance().extend_ttl()` calls or document the TTL policy so old escrows don't become unclaimable due to storage expiry.
2. **Dispute window** — Consider a time window after `unlock_time` during which the sender can still cancel if the recipient has not yet claimed, rather than allowing cancellation at any time.
3. **Multi-sig sender** — For large gifts, consider requiring a multi-sig sender address.
4. **Contract versioning** — Tag `v1.0.0-audit` on the commit after this PR merges.
