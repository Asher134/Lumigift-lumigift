# Gift Amount Limits

## Overview

The Lumigift escrow contract enforces configurable minimum and maximum gift amounts at the contract level to:
- **Prevent dust attacks**: Reject gifts below 1 USDC (10,000,000 stroops)
- **Limit exposure**: Cap gifts at 10,000 USDC (100,000,000,000 stroops)
- **Enable flexibility**: Allow admins to adjust limits without contract upgrade

## Default Limits

- **Minimum**: 1 USDC (10,000,000 stroops)
- **Maximum**: 10,000 USDC (100,000,000,000 stroops)

## Constants

```rust
const DEFAULT_MIN_AMOUNT: i128 = 10_000_000;      // 1 USDC
const DEFAULT_MAX_AMOUNT: i128 = 100_000_000_000; // 10,000 USDC
```

## Storage Keys

```rust
pub enum DataKey {
    MinAmount,  // Minimum gift amount in stroops
    MaxAmount,  // Maximum gift amount in stroops
    // ... other keys
}
```

## Admin Operations

### SetAmountLimits

Allows admins to update gift amount limits via multisig proposal.

**Enum Variant:**
```rust
pub enum AdminOp {
    SetAmountLimits,  // Set gift amount limits
    // ... other operations
}
```

**Multisig Flow:**
1. Any signer calls `propose_admin_op(AdminOp::SetAmountLimits, payload)`
2. Other signers call `approve_admin_op()` to add their approval
3. When approvals ≥ threshold, proposal executes automatically
4. Admin calls `execute_set_amount_limits(new_min, new_max)` to apply changes

**Validation:**
- Caller must be a registered signer
- `new_min` must be > 0
- `new_max` must be > 0
- `new_min` must be ≤ `new_max`

**Events:**
```
amount_limits_updated(new_min_amount, new_max_amount, timestamp)
```

## Contract Functions

### initialize()

Validates gift amount against current limits:

```rust
pub fn initialize(
    env: Env,
    admin: Address,
    gift_id: Symbol,
    sender: Address,
    recipient: Address,
    token: Address,
    amount: i128,
    unlock_time: u64,
    signers: Vec<Address>,
    threshold: u32,
) -> Result<(), EscrowError>
```

**Validation:**
```rust
let min_amount = get_min_amount(&env);
let max_amount = get_max_amount(&env);

if amount < min_amount {
    return Err(EscrowError::InvalidAmount);
}
if amount > max_amount {
    return Err(EscrowError::InvalidAmount);
}
```

**Error:** `EscrowError::InvalidAmount` if amount is outside limits

### execute_set_amount_limits()

Updates the gift amount limits (called after multisig approval):

```rust
pub fn execute_set_amount_limits(
    env: Env,
    caller: Address,
    new_min_amount: i128,
    new_max_amount: i128,
) -> Result<(), EscrowError>
```

**Validation:**
- Caller must be a registered signer
- `new_min_amount` > 0
- `new_max_amount` > 0
- `new_min_amount` ≤ `new_max_amount`

**Errors:**
- `EscrowError::Unauthorized` if caller is not a signer
- `EscrowError::InvalidAmount` if validation fails

**Effects:**
- Updates `DataKey::MinAmount` in storage
- Updates `DataKey::MaxAmount` in storage
- Emits `amount_limits_updated` event

### get_amount_limits()

Read-only function to retrieve current limits:

```rust
pub fn get_amount_limits(env: Env) -> (i128, i128)
```

**Returns:** `(min_amount, max_amount)`

**Behavior:**
- Returns stored values if set
- Returns defaults if not yet configured

## Helper Functions

### get_min_amount()

```rust
fn get_min_amount(env: &Env) -> i128
```

Returns the current minimum amount or `DEFAULT_MIN_AMOUNT` if not set.

### get_max_amount()

```rust
fn get_max_amount(env: &Env) -> i128
```

Returns the current maximum amount or `DEFAULT_MAX_AMOUNT` if not set.

## Error Handling

### InvalidAmount

Returned when:
- Gift amount < minimum limit
- Gift amount > maximum limit
- Setting limits with `min > max`
- Setting limits with non-positive amounts

**Error Code:** 7

## Testing

### Boundary Tests

The contract includes comprehensive boundary tests:

1. **test_amount_below_minimum_rejected** — Rejects amounts below minimum
2. **test_amount_above_maximum_rejected** — Rejects amounts above maximum
3. **test_amount_at_minimum_boundary_accepted** — Accepts exactly minimum
4. **test_amount_at_maximum_boundary_accepted** — Accepts exactly maximum
5. **test_get_amount_limits_returns_defaults** — Verifies default values
6. **test_set_amount_limits_requires_signer** — Enforces signer requirement
7. **test_set_amount_limits_validates_min_max** — Validates min ≤ max
8. **test_set_amount_limits_validates_positive** — Validates positive amounts
9. **test_set_amount_limits_updates_storage** — Verifies storage updates
10. **test_initialize_respects_updated_limits** — Verifies new limits are enforced

### Running Tests

```bash
cd contracts/escrow
cargo test
```

## Example Usage

### Initialize with Default Limits

```rust
// Minimum: 1 USDC, Maximum: 10,000 USDC
client.initialize(
    &admin,
    &Symbol::new(&env, "gift_1"),
    &sender,
    &recipient,
    &token,
    &50_000_000,  // 5 USDC (within limits)
    &unlock_time,
    &signers,
    &threshold,
)?;
```

### Propose New Limits

```rust
// Propose to change limits to 0.5 - 5,000 USDC
let new_min = 5_000_000;      // 0.5 USDC
let new_max = 50_000_000_000; // 5,000 USDC

client.propose_admin_op(
    &signer1,
    &AdminOp::SetAmountLimits,
    &payload,  // Encoded new_min and new_max
)?;

// Other signers approve
client.approve_admin_op(&signer2)?;

// Apply the changes
client.execute_set_amount_limits(&signer1, &new_min, &new_max)?;
```

### Check Current Limits

```rust
let (min, max) = client.get_amount_limits();
println!("Min: {} stroops, Max: {} stroops", min, max);
```

## Security Considerations

1. **Multisig Protection**: Limit changes require M-of-N approval
2. **Validation**: All inputs validated before storage
3. **Atomicity**: Limits updated together (min and max)
4. **Immutability**: Once set, limits persist until next admin operation
5. **Defaults**: Safe defaults prevent uninitialized state

## Migration Notes

- Existing gifts are not affected by limit changes
- Only new gifts validate against updated limits
- Limits are optional; defaults apply if not set
- No contract upgrade required to change limits

## Related Documentation

- [Escrow Contract README](./README.md)
- [Storage Analysis](./STORAGE_ANALYSIS.md)
- [Audit Checklist](./AUDIT_CHECKLIST.md)
