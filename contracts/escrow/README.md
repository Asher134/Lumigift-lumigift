# Lumigift Escrow Contract

[![Contract Coverage](https://img.shields.io/badge/coverage-≥85%25-brightgreen)](../../.github/workflows/ci.yml)

Soroban smart contract that time-locks USDC for a recipient until a predetermined timestamp. Includes multisig admin operations for contract upgrades, pausing, and configurable gift amount limits.

**Table of Contents:**
- [Overview](#overview)
- [Storage Model](#storage-model)
- [Public Functions](#public-functions)
- [Data Structures](#data-structures)
- [Events](#events)
- [Error Codes](#error-codes)
- [Admin Operations](#admin-operations)
- [Building & Testing](#building--testing)

---

## Overview

The Lumigift escrow contract provides:
- **Time-locked USDC transfers**: Funds locked until a specified timestamp
- **Recipient-only claims**: Only the designated recipient can claim funds
- **Multisig admin control**: M-of-N approval for sensitive operations
- **Configurable limits**: Admin-controlled minimum and maximum gift amounts
- **Reentrancy protection**: Atomic state updates before external calls
- **TTL management**: Automatic ledger TTL extension to prevent premature expiry

### Key Features

| Feature | Description |
|---------|-------------|
| **Time-locking** | Funds locked until `unlock_time` |
| **Recipient-only** | Only recipient can claim funds |
| **Multisig** | M-of-N approval for admin operations |
| **Configurable limits** | Min/max amounts set by admin |
| **Reentrancy safe** | State updated before token transfer |
| **TTL management** | Auto-extends to prevent expiry |
| **Event logging** | All state changes emit events |

### USDC Contract Addresses

| Network  | Address |
|----------|---------|
| Mainnet  | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` |
| Testnet  | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

---

## Storage Model

All state is kept in **instance storage** (tied to the contract instance lifetime and auto-extended on every invocation).

### Storage Keys

| `DataKey` | Type | Description | Mutable |
|-----------|------|-------------|---------|
| `Admin` | `Address` | Contract administrator | No |
| `Sender` | `Address` | Gift creator; authorized initial token transfer | No |
| `Recipient` | `Address` | Address authorized to claim funds | No |
| `Token` | `Address` | USDC contract address | No |
| `Amount` | `i128` | Locked amount in stroops (≥ 10,000,000 = 1 USDC) | No |
| `UnlockTime` | `u64` | Unix timestamp (seconds) after which claim is open | No |
| `Claimed` | `bool` | `false` until claim succeeds; set to `true` atomically | Yes |
| `Cancelled` | `bool` | `true` if sender cancelled the gift | Yes |
| `Expired` | `bool` | `true` if sender recovered funds after 1 year | Yes |
| `GiftId` | `Symbol` | Unique identifier for the gift | No |
| `SchemaVersion` | `u32` | Storage layout version for migrations | No |
| `Paused` | `bool` | `true` if new gift creation is paused | Yes |
| `MinAmount` | `i128` | Minimum gift amount in stroops (configurable) | Yes |
| `MaxAmount` | `i128` | Maximum gift amount in stroops (configurable) | Yes |
| `Signers` | `Vec<Address>` | Multisig signer set | Yes |
| `Threshold` | `u32` | Multisig approval threshold | Yes |
| `Proposal` | `Proposal` | Current pending admin proposal | Yes |

### Default Values

| Key | Default Value |
|-----|----------------|
| `MinAmount` | 10,000,000 stroops (1 USDC) |
| `MaxAmount` | 100,000,000,000 stroops (10,000 USDC) |
| `Paused` | `false` |
| `Threshold` | 1 |

---

## Public Functions

### Gift Lifecycle Functions

#### `initialize(admin, gift_id, sender, recipient, token, amount, unlock_time, signers, threshold) → Result<(), EscrowError>`

Initializes the escrow with gift parameters and multisig configuration.

**Parameters:**
- `admin: Address` — Contract administrator
- `gift_id: Symbol` — Unique identifier for this gift
- `sender: Address` — Gift creator (must authorize the call)
- `recipient: Address` — Recipient who can claim funds
- `token: Address` — USDC contract address
- `amount: i128` — Amount in stroops (must be within configured limits)
- `unlock_time: u64` — Unix timestamp when claim becomes available
- `signers: Vec<Address>` — Multisig signer set
- `threshold: u32` — Number of approvals required for admin ops

**Returns:** `Result<(), EscrowError>`

**Preconditions:**
- Contract must not already be initialized (`AlreadyInitialized`)
- `amount >= MinAmount` and `amount <= MaxAmount` (`InvalidAmount`)
- `unlock_time > ledger.timestamp() + 3600` seconds (`InvalidUnlockTime`)
- `threshold > 0` and `threshold <= signers.len()` (`InvalidThreshold`)
- Contract must not be paused (panics if paused)
- `sender` must authorize the call

**Effects:**
- Stores all parameters in instance storage
- Sets `Claimed = false`, `Cancelled = false`, `Expired = false`
- Transfers `amount` tokens from `sender` to contract
- Extends instance TTL to cover `unlock_time` + 30-day buffer
- Emits `gift_created` event

**Events:**
```
gift_created(gift_id) → (sender, recipient, amount, unlock_time, timestamp)
```

---

#### `claim() → Result<(), EscrowError>`

Transfers locked funds to the recipient.

**Parameters:** None (caller is determined via `require_auth`)

**Returns:** `Result<(), EscrowError>`

**Preconditions:**
- Contract must be initialized (`NotInitialized`)
- Caller must be the `recipient` (enforced via `require_auth`)
- `ledger.timestamp() >= unlock_time` (`StillLocked`)
- Funds must not already be claimed (`AlreadyClaimed`)
- Funds must not be cancelled (`AlreadyCancelled`)

**Effects:**
- Sets `Claimed = true` (atomically before transfer for reentrancy protection)
- Transfers `amount` tokens from contract to `recipient`
- Extends instance TTL to 7-day post-claim window
- Emits `gift_claimed` event

**Events:**
```
gift_claimed(gift_id) → (recipient, amount, timestamp)
```

---

#### `cancel() → Result<(), EscrowError>`

Allows sender to cancel the gift and recover funds.

**Parameters:** None (caller is determined via `require_auth`)

**Returns:** `Result<(), EscrowError>`

**Preconditions:**
- Contract must be initialized (`NotInitialized`)
- Caller must be the `sender` (enforced via `require_auth`)
- Funds must not already be claimed (`AlreadyClaimed`)
- Funds must not already be cancelled (`AlreadyCancelled`)

**Effects:**
- Sets `Cancelled = true`
- Transfers `amount` tokens from contract back to `sender`
- Emits `gift_cancelled` event

**Events:**
```
gift_cancelled(gift_id) → (sender, amount, timestamp)
```

---

#### `expire() → Result<(), EscrowError>`

Allows sender to recover funds 1 year after unlock_time if not claimed.

**Parameters:** None (caller is determined via `require_auth`)

**Returns:** `Result<(), EscrowError>`

**Preconditions:**
- Contract must be initialized (`NotInitialized`)
- Caller must be the `sender` (enforced via `require_auth`)
- Funds must not already be claimed (`AlreadyClaimed`)
- Funds must not already be cancelled (`AlreadyCancelled`)
- Funds must not already be expired (`AlreadyCancelled`)
- `ledger.timestamp() >= unlock_time + 31536000` (1 year)

**Effects:**
- Sets `Expired = true`
- Transfers `amount` tokens from contract back to `sender`
- Emits `gift_expired` event

**Events:**
```
gift_expired(gift_id) → (sender, amount, timestamp)
```

---

### Query Functions

#### `get_state() → Result<(Address, i128, u64, bool), EscrowError>`

Returns the current state of the gift.

**Parameters:** None

**Returns:** `Result<(Address, i128, u64, bool), EscrowError>`
- `Address` — Recipient address
- `i128` — Amount in stroops
- `u64` — Unlock time (Unix timestamp)
- `bool` — Claimed status

**Preconditions:**
- Contract must be initialized (`NotInitialized`)

---

#### `get_multisig_config() → (Vec<Address>, u32)`

Returns the current multisig signer set and threshold.

**Parameters:** None

**Returns:** `(Vec<Address>, u32)`
- `Vec<Address>` — List of authorized signers
- `u32` — Number of approvals required

---

#### `get_amount_limits() → (i128, i128)`

Returns the current minimum and maximum gift amounts.

**Parameters:** None

**Returns:** `(i128, i128)`
- `i128` — Minimum amount in stroops
- `i128` — Maximum amount in stroops

---

### Admin Functions

#### `propose_admin_op(caller, op, payload) → Result<(), EscrowError>`

Proposes an admin operation (requires multisig approval).

**Parameters:**
- `caller: Address` — Signer proposing the operation
- `op: AdminOp` — Operation type (Upgrade, Pause, Unpause, SetSigners, SetAmountLimits)
- `payload: BytesN<32>` — Operation-specific payload

**Returns:** `Result<(), EscrowError>`

**Preconditions:**
- `caller` must be a registered signer (`Unauthorized`)
- `caller` must authorize the call

**Effects:**
- Creates a new proposal with `caller`'s implicit approval
- Stores proposal in instance storage
- Emits `admin_proposed` event

---

#### `approve_admin_op(caller) → Result<(), EscrowError>`

Approves a pending admin proposal. Executes automatically when threshold is reached.

**Parameters:**
- `caller: Address` — Signer approving the operation

**Returns:** `Result<(), EscrowError>`

**Preconditions:**
- A proposal must exist (`ProposalNotFound`)
- Proposal must not be expired (`ProposalExpired`)
- `caller` must be a registered signer (`Unauthorized`)
- `caller` must not have already approved (`AlreadyApproved`)
- `caller` must authorize the call

**Effects:**
- Adds `caller` to proposal approvals
- If approvals >= threshold: executes proposal and clears it
- Emits `admin_approved` event

---

#### `execute_set_signers(caller, new_signers, new_threshold) → Result<(), EscrowError>`

Updates the multisig signer set and threshold (called after SetSigners proposal approval).

**Parameters:**
- `caller: Address` — Signer executing the operation
- `new_signers: Vec<Address>` — New signer set
- `new_threshold: u32` — New approval threshold

**Returns:** `Result<(), EscrowError>`

**Preconditions:**
- `caller` must be a registered signer (`Unauthorized`)
- `new_threshold > 0` and `new_threshold <= new_signers.len()` (`InvalidThreshold`)

**Effects:**
- Updates `Signers` and `Threshold` in storage
- Emits `signers_updated` event

---

#### `execute_set_amount_limits(caller, new_min_amount, new_max_amount) → Result<(), EscrowError>`

Updates the gift amount limits (called after SetAmountLimits proposal approval).

**Parameters:**
- `caller: Address` — Signer executing the operation
- `new_min_amount: i128` — New minimum amount in stroops
- `new_max_amount: i128` — New maximum amount in stroops

**Returns:** `Result<(), EscrowError>`

**Preconditions:**
- `caller` must be a registered signer (`Unauthorized`)
- `new_min_amount > 0` and `new_max_amount > 0` (`InvalidAmount`)
- `new_min_amount <= new_max_amount` (`InvalidAmount`)

**Effects:**
- Updates `MinAmount` and `MaxAmount` in storage
- Emits `amount_limits_updated` event

---

#### `pause() → ()`

Pauses new gift creation (requires multisig approval via SetPause proposal).

**Parameters:** None

**Returns:** `()`

**Effects:**
- Sets `Paused = true`
- Subsequent `initialize` calls will panic
- Emits `paused` event

---

#### `upgrade(env, new_wasm_hash) → Result<(), EscrowError>`

Upgrades the contract WASM (requires multisig approval via Upgrade proposal).

**Parameters:**
- `new_wasm_hash: BytesN<32>` — Hash of new WASM code

**Returns:** `Result<(), EscrowError>`

**Effects:**
- Updates contract WASM code
- Emits `upgraded` event

---

#### `migrate() → Result<(), EscrowError>`

Migrates storage to new schema version (for future use).

**Parameters:** None

**Returns:** `Result<(), EscrowError>`

**Effects:**
- Updates `SchemaVersion` if needed
- Emits `migrated` event

---

## Data Structures

### `EscrowError` (Enum)

Error codes returned by contract functions.

```rust
#[contracterror]
pub enum EscrowError {
    AlreadyInitialized = 1,
    AlreadyClaimed     = 2,
    StillLocked        = 3,
    NotInitialized     = 4,
    Unauthorized       = 5,
    AlreadyCancelled   = 6,
    InvalidAmount      = 7,
    InvalidUnlockTime  = 8,
    ProposalNotFound   = 9,
    ProposalExpired    = 10,
    AlreadyApproved    = 11,
    InvalidThreshold   = 12,
}
```

---

### `AdminOp` (Enum)

Identifies which admin operation a proposal targets.

```rust
#[contracttype]
pub enum AdminOp {
    Upgrade,           // Update contract WASM
    Pause,             // Pause new gift creation
    Unpause,           // Resume gift creation
    SetSigners,        // Replace signer set and threshold
    SetAmountLimits,   // Update min/max gift amounts
}
```

---

### `Proposal` (Struct)

Represents a pending multisig proposal.

```rust
#[contracttype]
pub struct Proposal {
    pub op: AdminOp,                    // Operation type
    pub payload: BytesN<32>,            // Operation-specific data
    pub approvals: Vec<Address>,        // Signers who approved
    pub expires_at: u64,                // Unix timestamp when proposal expires
}
```

**Fields:**
- `op: AdminOp` — The admin operation being proposed
- `payload: BytesN<32>` — ABI-encoded operation payload
- `approvals: Vec<Address>` — List of signers who have approved
- `expires_at: u64` — Unix timestamp (7 days from proposal creation)

---

### `DataKey` (Enum)

Storage keys for contract state.

```rust
#[contracttype]
pub enum DataKey {
    Admin,           // Contract administrator
    Sender,          // Gift creator
    Recipient,       // Gift recipient
    UnlockTime,      // Unlock timestamp
    Claimed,         // Claim status
    Cancelled,       // Cancellation status
    Expired,         // Expiration status
    GiftId,          // Unique gift identifier
    SchemaVersion,   // Storage schema version
    Paused,          // Pause status
    MinAmount,       // Minimum gift amount
    MaxAmount,       // Maximum gift amount
}
```

---

## Events

All state changes emit events for off-chain indexing and monitoring.

### Gift Lifecycle Events

#### `gift_created`
Emitted when a gift is initialized.

**Payload:**
```
(Symbol: gift_id) → (Address: sender, Address: recipient, i128: amount, u64: unlock_time, u64: timestamp)
```

---

#### `gift_claimed`
Emitted when a recipient claims funds.

**Payload:**
```
(Symbol: gift_id) → (Address: recipient, i128: amount, u64: timestamp)
```

---

#### `gift_cancelled`
Emitted when a sender cancels a gift.

**Payload:**
```
(Symbol: gift_id) → (Address: sender, i128: amount, u64: timestamp)
```

---

#### `gift_expired`
Emitted when a sender recovers funds after 1 year.

**Payload:**
```
(Symbol: gift_id) → (Address: sender, i128: amount, u64: timestamp)
```

---

### Admin Events

#### `admin_proposed`
Emitted when an admin operation is proposed.

**Payload:**
```
(AdminOp: op) → (Address: proposer, u64: timestamp)
```

---

#### `admin_approved`
Emitted when an admin operation is approved.

**Payload:**
```
() → (Address: approver, u32: approvals_count, u32: threshold, u64: timestamp)
```

---

#### `signers_updated`
Emitted when the multisig signer set is updated.

**Payload:**
```
() → (u32: new_threshold, u64: timestamp)
```

---

#### `amount_limits_updated`
Emitted when gift amount limits are updated.

**Payload:**
```
() → (i128: new_min_amount, i128: new_max_amount, u64: timestamp)
```

---

#### `paused`
Emitted when gift creation is paused.

**Payload:**
```
() → (u64: timestamp)
```

---

#### `upgraded`
Emitted when contract WASM is upgraded.

**Payload:**
```
() → (BytesN<32>: new_wasm_hash, u64: timestamp)
```

---

## Error Codes

| Code | Variant | Description | When Raised |
|------|---------|-------------|-------------|
| 1 | `AlreadyInitialized` | Contract already initialized | `initialize` called on initialized contract |
| 2 | `AlreadyClaimed` | Funds already claimed | `claim` called after successful claim |
| 3 | `StillLocked` | Funds still locked | `claim` called before `unlock_time` |
| 4 | `NotInitialized` | Contract not initialized | Any function called before `initialize` |
| 5 | `Unauthorized` | Caller not authorized | Non-signer calls admin function |
| 6 | `AlreadyCancelled` | Gift already cancelled | `claim` called on cancelled gift |
| 7 | `InvalidAmount` | Amount outside limits | `amount < min` or `amount > max` |
| 8 | `InvalidUnlockTime` | Unlock time too soon | `unlock_time <= now + 3600` |
| 9 | `ProposalNotFound` | No pending proposal | `approve_admin_op` with no proposal |
| 10 | `ProposalExpired` | Proposal expired | Proposal older than 7 days |
| 11 | `AlreadyApproved` | Already approved | Signer approves same proposal twice |
| 12 | `InvalidThreshold` | Invalid threshold | `threshold > signers.len()` or `threshold == 0` |

---

## Admin Operations

### Multisig Flow

All sensitive admin operations follow this flow:

1. **Propose** — Any signer calls `propose_admin_op(op, payload)`
   - Creates proposal with proposer's implicit approval
   - Proposal expires after 7 days

2. **Approve** — Other signers call `approve_admin_op()`
   - Adds signer to approvals list
   - Checks for duplicate approvals

3. **Execute** — When approvals >= threshold
   - Proposal executes automatically on final approval
   - Proposal is cleared from storage
   - Operation-specific function called (e.g., `execute_set_signers`)

### Supported Operations

| Operation | Payload | Effect |
|-----------|---------|--------|
| `Upgrade` | New WASM hash | Updates contract code |
| `Pause` | None | Prevents new gift creation |
| `Unpause` | None | Resumes gift creation |
| `SetSigners` | New signers + threshold | Updates multisig config |
| `SetAmountLimits` | Min + max amounts | Updates gift amount limits |

---

## Building & Testing

### Build WASM

```bash
# From repo root
npm run contract:build

# Or from contracts directory
cd contracts/escrow
cargo build --target wasm32-unknown-unknown --release
```

### Run Tests

```bash
# Run all tests
cd contracts/escrow
cargo test

# Run specific test
cargo test test_initialize_and_claim

# Run with output
cargo test -- --nocapture
```

### Test Coverage

The contract includes comprehensive tests:
- Gift initialization and claiming
- Multisig proposal and approval flow
- Amount limit validation (boundary tests)
- Error handling for all error codes
- State transitions and atomicity

---

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_MIN_AMOUNT` | 10,000,000 | Default minimum (1 USDC) |
| `DEFAULT_MAX_AMOUNT` | 100,000,000,000 | Default maximum (10,000 USDC) |
| `MIN_LOCK_DURATION` | 3,600 | Minimum lock duration (1 hour) |
| `LEDGER_CLOSE_SECS` | 5 | Soroban ledger close time |
| `BUFFER_LEDGERS` | 518,400 | 30-day TTL buffer |
| `MIN_TTL_THRESHOLD` | 120,960 | Minimum TTL threshold (~7 days) |
| `POST_CLAIM_TTL_LEDGERS` | 120,960 | Post-claim TTL (~7 days) |
| `PROPOSAL_TTL_SECS` | 604,800 | Proposal expiry (7 days) |
| `STORAGE_SCHEMA_VERSION` | 1 | Current storage schema version |

---

## Related Documentation

- [Amount Limits Guide](./AMOUNT_LIMITS.md)
- [Storage Analysis](./STORAGE_ANALYSIS.md)
- [Audit Checklist](./AUDIT_CHECKLIST.md)
- [Benchmarks](./BENCHMARKS.md)
