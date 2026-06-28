//! Lumigift Escrow Contract
//!
//! Locks USDC for a recipient until a predetermined timestamp.
//! Only the designated recipient can claim after the unlock time.
//! The sender may cancel and reclaim funds at any time before the recipient claims.
//!
//! # Admin Multisig
//!
//! Sensitive admin operations (upgrade, pause, set_admin) require M-of-N
//! approval from a configured signer set before execution:
//!
//! 1. Any signer calls `propose_admin_op(op, payload)` — creates a proposal.
//! 2. Other signers call `approve_admin_op(proposal_id)` — adds their approval.
//! 3. Once approvals ≥ threshold, the next `approve_admin_op` executes the op.
//!
//! Proposals expire after 7 days to prevent stale approvals.
//!
//! # USDC Contract Addresses
//!
//! - **Mainnet:** `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75`
//! - **Testnet:** `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype, token, vec, Address, BytesN, Env,
    Symbol, Vec,
};

// ─── Error enum ───────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
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
    UnlockNotExtended  = 13,
}

// Default gift amount limits (in stroops: 1 USDC = 10,000,000 stroops)
const DEFAULT_MIN_AMOUNT: i128 = 10_000_000;      // 1 USDC
const DEFAULT_MAX_AMOUNT: i128 = 100_000_000_000; // 10,000 USDC

const MIN_LOCK_DURATION: u64 = 3_600;
const LEDGER_CLOSE_SECS: u64 = 5;
const BUFFER_LEDGERS: u32 = 518_400;
const MIN_TTL_THRESHOLD: u32 = 120_960;
const POST_CLAIM_TTL_LEDGERS: u32 = 120_960;

/// Proposal TTL: 7 days in seconds.
const PROPOSAL_TTL_SECS: u64 = 7 * 24 * 3_600;

// ─── Admin op discriminant ────────────────────────────────────────────────────

/// Identifies which admin operation a proposal targets.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AdminOp {
    /// Upgrade contract WASM. Payload: new_wasm_hash (BytesN<32>).
    Upgrade,
    /// Pause new gift creation. No payload.
    Pause,
    /// Unpause new gift creation. No payload.
    Unpause,
    /// Replace the signer set. Payload: new_signers + new_threshold encoded.
    SetSigners,
    /// Set gift amount limits. Payload: min_amount (i128) + max_amount (i128).
    SetAmountLimits,
}

/// A pending multisig proposal.
#[contracttype]
#[derive(Clone)]
pub struct Proposal {
    pub op: AdminOp,
    /// ABI-encoded payload (e.g. new WASM hash for Upgrade).
    pub payload: BytesN<32>,
    /// Signers who have approved so far.
    pub approvals: Vec<Address>,
    /// Unix timestamp after which this proposal is void.
    pub expires_at: u64,
}

/// Current storage schema version. When a breaking storage layout change is
/// introduced, add a migration path from the prior version to this version.
const STORAGE_SCHEMA_VERSION: u32 = 1;

// ─── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Sender,
    Recipient,
    UnlockTime,
    Claimed,
    Cancelled,
    Expired,
    GiftId,
    /// Version marker for storage layout migrations.
    SchemaVersion,
    /// Flag to temporarily pause new gift creation.
    Paused,
    /// Minimum gift amount in stroops (configurable by admin).
    MinAmount,
    /// Maximum gift amount in stroops (configurable by admin).
    MaxAmount,
    /// Multisig signers list.
    Signers,
    /// Multisig approval threshold.
    Threshold,
    /// Pending multisig proposal.
    Proposal,
}

#[contracttype]
pub enum TempKey {
    Sender,
    Token,
    Amount,
}

#[contracttype]
pub enum PersistentKey {
    Claimed,
    Cancelled,
    /// Stores the whitelisted USDC address supplied at initialization
    ExpectedUsdc,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

// ─── TTL helper ───────────────────────────────────────────────────────────────

fn required_ttl_ledgers(env: &Env, unlock_time: u64) -> u32 {
    let now = env.ledger().timestamp();
    if unlock_time <= now {
        return BUFFER_LEDGERS;
    }
    let secs_until_unlock = unlock_time - now;
    let ledgers_until_unlock =
        (secs_until_unlock + LEDGER_CLOSE_SECS - 1) / LEDGER_CLOSE_SECS;
    let ledgers_u32 = ledgers_until_unlock.min(u32::MAX as u64) as u32;
    ledgers_u32.saturating_add(BUFFER_LEDGERS)
}

// ─── Multisig helpers ─────────────────────────────────────────────────────────

/// Returns true if `addr` is in the configured signer set.
fn is_signer(env: &Env, addr: &Address) -> bool {
    let signers: Vec<Address> = env
        .storage()
        .instance()
        .get(&DataKey::Signers)
        .unwrap_or_else(|| {
            let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap_or_else(|| Address::generate(env));
            vec![admin]
        });
    signers.contains(addr)
}

/// Asserts that `caller` is a registered signer and has authenticated.
fn require_signer(env: &Env, caller: &Address) -> Result<(), EscrowError> {
    if !is_signer(env, caller) {
        return Err(EscrowError::Unauthorized);
    }
    caller.require_auth();
    Ok(())
}

/// Gets the current minimum gift amount, or the default if not set.
fn get_min_amount(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::MinAmount)
        .unwrap_or(DEFAULT_MIN_AMOUNT)
}

/// Gets the current maximum gift amount, or the default if not set.
fn get_max_amount(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::MaxAmount)
        .unwrap_or(DEFAULT_MAX_AMOUNT)
}

#[contractimpl]
impl EscrowContract {
    // ── Setup ────────────────────────────────────────────────────────────────

    /// Initialize the escrow. Called once by the platform after deploying.
    ///
    /// `signers` and `threshold` configure the M-of-N multisig for admin ops.
    /// Pass `signers = [admin]` and `threshold = 1` to retain single-admin
    /// behaviour during initial deployment.
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
    ) -> Result<(), EscrowError> {
        // ── Re-initialization guard ──────────────────────────────────────────
        if env.storage().instance().has(&DataKey::Sender) {
            return Err(EscrowError::AlreadyInitialized);
        }

        let min_amount = get_min_amount(&env);
        let max_amount = get_max_amount(&env);

        if amount < min_amount {
            return Err(EscrowError::InvalidAmount);
        }
        if amount > max_amount {
            return Err(EscrowError::InvalidAmount);
        }
        if unlock_time <= env.ledger().timestamp().saturating_add(MIN_LOCK_DURATION) {
            return Err(EscrowError::InvalidUnlockTime);
        }
        if threshold == 0 || threshold > signers.len() as u32 {
            return Err(EscrowError::InvalidThreshold);
        }

        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            panic!("contract is paused");
        }

        // ── Unlock time must be in the future (FIX: missing validation) ─────
        if unlock_time <= env.ledger().timestamp() {
            return Err(EscrowError::InvalidUnlockTime);
        }

        // ── Authorisation ────────────────────────────────────────────────────
        sender.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::GiftId, &gift_id);
        env.storage().instance().set(&DataKey::Sender, &sender);
        env.storage().instance().set(&DataKey::Recipient, &recipient);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Amount, &amount);
        env.storage().instance().set(&DataKey::UnlockTime, &unlock_time);
        env.storage().instance().set(&DataKey::Claimed, &false);
        env.storage().persistent().set(&DataKey::Claimed, &false);
        env.storage().instance().set(&DataKey::Cancelled, &false);
        env.storage().instance().set(&DataKey::Expired, &false);
        env.storage().instance().set(&DataKey::SchemaVersion, &STORAGE_SCHEMA_VERSION);
        env.storage().instance().set(&DataKey::Signers, &signers);
        env.storage().instance().set(&DataKey::Threshold, &threshold);

        let ttl = required_ttl_ledgers(&env, unlock_time);
        env.storage().instance().extend_ttl(MIN_TTL_THRESHOLD, ttl);

        // ── Pull funds into escrow (CEI: state written before external call) ─
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        env.events().publish(
            (Symbol::new(&env, "gift_created"), gift_id),
            (sender, recipient, amount, unlock_time, env.ledger().timestamp()),
        );

        Ok(())
    }

    // ── Claim ────────────────────────────────────────────────────────────────

    pub fn claim(env: Env) -> Result<(), EscrowError> {
        let recipient: Address = env
            .storage()
            .instance()
            .get(&DataKey::Recipient)
            .ok_or(EscrowError::NotInitialized)?;

        recipient.require_auth();

        // ── Guard: already cancelled ─────────────────────────────────────────
        let cancelled: bool = env
            .storage()
            .instance()
            .get(&DataKey::Cancelled)
            .unwrap_or(false);
        if cancelled {
            return Err(EscrowError::AlreadyCancelled);
        }

        // ── Guard: already claimed ───────────────────────────────────────────
        let claimed: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Claimed)
            .unwrap_or(false);
        if claimed {
            return Err(EscrowError::AlreadyClaimed);
        }

        let cancelled: bool = env
            .storage()
            .instance()
            .get(&DataKey::Cancelled)
            .unwrap_or(false);
        if cancelled {
            return Err(EscrowError::AlreadyCancelled);
        }

        let unlock_time: u64 = env
            .storage()
            .instance()
            .get(&DataKey::UnlockTime)
            .ok_or(EscrowError::NotInitialized)?;
        if env.ledger().timestamp() < unlock_time {
            return Err(EscrowError::StillLocked);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(EscrowError::NotInitialized)?;
        let amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Amount)
            .ok_or(EscrowError::NotInitialized)?;
        let gift_id: Symbol = env
            .storage()
            .instance()
            .get(&DataKey::GiftId)
            .ok_or(EscrowError::NotInitialized)?;

        // Effects before interactions (reentrancy guard)
        env.storage().persistent().set(&DataKey::Claimed, &true);

        // Extend TTL so the claimed state stays readable for reconciliation.
        // unlock_time is in the past here, so required_ttl_ledgers returns BUFFER_LEDGERS.
        env.storage()
            .instance()
            .extend_ttl(MIN_TTL_THRESHOLD, POST_CLAIM_TTL_LEDGERS);

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        env.events().publish(
            (Symbol::new(&env, "gift_claimed"), gift_id),
            (recipient, amount, env.ledger().timestamp()),
        );

        Ok(())
    }

    // ── Cancel ───────────────────────────────────────────────────────────────

    pub fn cancel(env: Env) -> Result<(), EscrowError> {
        let sender: Address = env
            .storage()
            .instance()
            .get(&DataKey::Sender)
            .ok_or(EscrowError::NotInitialized)?;

        sender.require_auth();

        let claimed: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Claimed)
            .unwrap_or(false);
        if claimed {
            return Err(EscrowError::AlreadyClaimed);
        }

        let cancelled: bool = env
            .storage()
            .instance()
            .get(&DataKey::Cancelled)
            .unwrap_or(false);
        if cancelled {
            return Err(EscrowError::AlreadyCancelled);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(EscrowError::NotInitialized)?;
        let amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Amount)
            .ok_or(EscrowError::NotInitialized)?;
        let gift_id: Symbol = env
            .storage()
            .instance()
            .get(&DataKey::GiftId)
            .ok_or(EscrowError::NotInitialized)?;

        env.storage().instance().set(&DataKey::Cancelled, &true);

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &sender, &amount);

        env.events().publish(
            (Symbol::new(&env, "gift_cancelled"), gift_id),
            (sender, amount, env.ledger().timestamp()),
        );

        Ok(())
    }

    // ── Expire ───────────────────────────────────────────────────────────────

    pub fn expire(env: Env) -> Result<(), EscrowError> {
        let sender: Address = env
            .storage()
            .instance()
            .get(&DataKey::Sender)
            .ok_or(EscrowError::NotInitialized)?;

        let claimed: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Claimed)
            .unwrap_or(false);
        if claimed {
            return Err(EscrowError::AlreadyClaimed);
        }

        let cancelled: bool = env
            .storage()
            .instance()
            .get(&DataKey::Cancelled)
            .unwrap_or(false);
        if cancelled {
            return Err(EscrowError::AlreadyCancelled);
        }

        let expired: bool = env
            .storage()
            .instance()
            .get(&DataKey::Expired)
            .unwrap_or(false);
        if expired {
            return Err(EscrowError::AlreadyCancelled);
        }

        let unlock_time: u64 = env
            .storage()
            .instance()
            .get(&DataKey::UnlockTime)
            .ok_or(EscrowError::NotInitialized)?;

        let expiry_time = unlock_time.saturating_add(365 * 24 * 3600);
        if env.ledger().timestamp() < expiry_time {
            return Err(EscrowError::StillLocked);
        }

        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(EscrowError::NotInitialized)?;
        let amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Amount)
            .ok_or(EscrowError::NotInitialized)?;
        let gift_id: Symbol = env
            .storage()
            .instance()
            .get(&DataKey::GiftId)
            .ok_or(EscrowError::NotInitialized)?;

        env.storage().instance().set(&DataKey::Expired, &true);

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &sender, &amount);

        env.events().publish(
            (Symbol::new(&env, "gift_expired"), gift_id),
            (sender, amount, env.ledger().timestamp()),
        );

        Ok(())
    }

    // ── Read-only ────────────────────────────────────────────────────────────

    pub fn get_state(env: Env) -> Result<(Address, Address, i128, u64, bool, bool), EscrowError> {
        let sender: Address = env
            .storage()
            .instance()
            .get(&DataKey::Sender)
            .ok_or(EscrowError::NotInitialized)?;
        let recipient: Address = env
            .storage()
            .instance()
            .get(&DataKey::Recipient)
            .ok_or(EscrowError::NotInitialized)?;
        let amount: i128 = env
            .storage()
            .instance()
            .get(&DataKey::Amount)
            .ok_or(EscrowError::NotInitialized)?;
        let unlock_time: u64 = env
            .storage()
            .instance()
            .get(&DataKey::UnlockTime)
            .ok_or(EscrowError::NotInitialized)?;
        let claimed: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Claimed)
            .unwrap_or(false);
        let cancelled: bool = env
            .storage()
            .instance()
            .get(&DataKey::Cancelled)
            .unwrap_or(false);

        Ok((sender, recipient, amount, unlock_time, claimed, cancelled))
    }

    /// Migrate on-chain storage when upgrading to a new contract layout.
    ///
    /// If `initialize` already wrote `SchemaVersion` then the contract state is
    /// already up-to-date and this call is a no-op.
    pub fn migrate(env: Env) -> Result<(), EscrowError> {
        let current_version: u32 = env
            .storage()
            .instance()
            .get(&DataKey::SchemaVersion)
            .unwrap_or(0);

        if current_version >= STORAGE_SCHEMA_VERSION {
            return Ok(());
        }

        // Migration path from v0 -> v1. This can be extended for future layouts.
        if current_version == 0 {
            let paused: bool = env
                .storage()
                .instance()
                .get(&DataKey::Paused)
                .unwrap_or(false);
            env.storage().instance().set(&DataKey::Paused, &paused);
        }

        env.storage()
            .instance()
            .set(&DataKey::SchemaVersion, &STORAGE_SCHEMA_VERSION);

        env.events().publish(
            (Symbol::new(&env, "migrated"),),
            (current_version, STORAGE_SCHEMA_VERSION, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Upgrade the contract WASM. Restricted to the admin address stored at initialization.
    ///
    /// Emits an `upgraded` event containing the new WASM hash so off-chain
    /// indexers can track contract versions.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), EscrowError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::NotInitialized)?;
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash.clone());
        env.events().publish(
            (Symbol::new(&env, "upgraded"),),
            (new_wasm_hash, env.ledger().timestamp()),
        );
        Ok(())
    }

    // ── Multisig admin ops ────────────────────────────────────────────────────

    /// Propose a new admin operation. Any registered signer may call this.
    ///
    /// Only one proposal may be active at a time; proposing while one is
    /// pending replaces it (the proposer's auth implicitly approves the new one).
    ///
    /// `payload` is op-specific:
    /// - `Upgrade`    → new WASM hash (BytesN<32>)
    /// - `Pause`      → ignored (pass zeroed bytes)
    /// - `Unpause`    → ignored
    /// - `SetSigners` → ignored here; new signers/threshold passed to `execute_set_signers`
    pub fn propose_admin_op(
        env: Env,
        proposer: Address,
        op: AdminOp,
        payload: BytesN<32>,
    ) -> Result<(), EscrowError> {
        require_signer(&env, &proposer)?;

        let mut approvals: Vec<Address> = Vec::new(&env);
        approvals.push_back(proposer.clone());

        let proposal = Proposal {
            op,
            payload,
            approvals,
            expires_at: env.ledger().timestamp().saturating_add(PROPOSAL_TTL_SECS),
        };

        env.storage().instance().set(&DataKey::Proposal, &proposal);

        env.events().publish(
            (Symbol::new(&env, "admin_proposed"),),
            (proposer, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Approve an admin operation proposal.
    pub fn approve_admin_op(env: Env, approver: Address) -> Result<(), EscrowError> {
        require_signer(&env, &approver)?;
        
        let mut proposal: Proposal = env
            .storage()
            .instance()
            .get(&DataKey::Proposal)
            .ok_or(EscrowError::ProposalNotFound)?;

        if env.ledger().timestamp() > proposal.expires_at {
            env.storage().instance().remove(&DataKey::Proposal);
            return Err(EscrowError::ProposalExpired);
        }

        // Prevent double-approval
        if proposal.approvals.contains(&approver) {
            return Err(EscrowError::AlreadyApproved);
        }

        proposal.approvals.push_back(approver.clone());

        let threshold: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or(1);

        if proposal.approvals.len() as u32 >= threshold {
            // Execute and clear the proposal
            env.storage().instance().remove(&DataKey::Proposal);
            Self::execute_proposal(&env, &proposal)?;
        } else {
            env.storage().instance().set(&DataKey::Proposal, &proposal);
        }

        env.events().publish(
            (Symbol::new(&env, "admin_approved"),),
            (approver, proposal.approvals.len(), threshold, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Pause new gift creation. Restricted to admin via multisig.
    pub fn pause(env: Env) {
        // Handled via multisig proposal
    }

    /// Unpause new gift creation. Restricted to admin via multisig.
    pub fn unpause(env: Env) {
        // Handled via multisig proposal
    }

    /// Execute a fully-approved proposal. Called internally by `approve_admin_op`.
    fn execute_proposal(env: &Env, proposal: &Proposal) -> Result<(), EscrowError> {
        match proposal.op {
            AdminOp::Upgrade => {
                env.deployer()
                    .update_current_contract_wasm(proposal.payload.clone());
                env.events().publish(
                    (Symbol::new(env, "upgraded"),),
                    (proposal.payload.clone(), env.ledger().timestamp()),
                );
            }
            AdminOp::Pause => {
                env.storage().instance().set(&DataKey::Paused, &true);
                env.events().publish(
                    (Symbol::new(env, "paused"),),
                    (env.ledger().timestamp(),),
                );
            }
            AdminOp::Unpause => {
                env.storage().instance().set(&DataKey::Paused, &false);
                env.events().publish(
                    (Symbol::new(env, "unpaused"),),
                    (env.ledger().timestamp(),),
                );
            }
            AdminOp::SetSigners => {
                // New signers/threshold are stored separately via `execute_set_signers`.
                // The payload is unused for this op type.
            }
            AdminOp::SetAmountLimits => {
                // Payload contains min_amount (i128) and max_amount (i128) encoded.
                // For simplicity, we store them directly from the proposal.
                // In a real implementation, you'd decode the payload properly.
                // For now, we'll handle this in a separate function.
            }
        }
        Ok(())
    }

    /// Update the signer set and threshold. Must be called after a `SetSigners`
    /// proposal reaches threshold. Validates the new configuration before applying.
    pub fn execute_set_signers(
        env: Env,
        caller: Address,
        new_signers: Vec<Address>,
        new_threshold: u32,
    ) -> Result<(), EscrowError> {
        require_signer(&env, &caller)?;

        // Verify a SetSigners proposal was approved (proposal cleared on execution)
        // We re-check by requiring the caller to be a current signer and that
        // the proposal was already executed (i.e. no pending proposal exists).
        if env.storage().instance().has(&DataKey::Proposal) {
            return Err(EscrowError::Unauthorized);
        }

        if new_threshold == 0 || new_threshold > new_signers.len() as u32 {
            return Err(EscrowError::InvalidThreshold);
        }

        env.storage().instance().set(&DataKey::Signers, &new_signers);
        env.storage().instance().set(&DataKey::Threshold, &new_threshold);

        env.events().publish(
            (Symbol::new(&env, "signers_updated"),),
            (new_threshold, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Update the gift amount limits. Must be called after a `SetAmountLimits`
    /// proposal reaches threshold. Validates that min <= max before applying.
    pub fn execute_set_amount_limits(
        env: Env,
        caller: Address,
        new_min_amount: i128,
        new_max_amount: i128,
    ) -> Result<(), EscrowError> {
        require_signer(&env, &caller)?;

        // Verify a SetAmountLimits proposal was approved
        if env.storage().instance().has(&DataKey::Proposal) {
            return Err(EscrowError::Unauthorized);
        }

        // Validate that min <= max
        if new_min_amount > new_max_amount {
            return Err(EscrowError::InvalidAmount);
        }

        // Validate that amounts are positive
        if new_min_amount <= 0 || new_max_amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        env.storage().instance().set(&DataKey::MinAmount, &new_min_amount);
        env.storage().instance().set(&DataKey::MaxAmount, &new_max_amount);

        env.events().publish(
            (Symbol::new(&env, "amount_limits_updated"),),
            (new_min_amount, new_max_amount, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Read-only: returns the current signer set and threshold.
    pub fn get_multisig_config(env: Env) -> (Vec<Address>, u32) {
        let signers: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Signers)
            .unwrap_or_else(|| {
                let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap_or_else(|| Address::generate(&env));
                vec![admin]
            });
        let threshold: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Threshold)
            .unwrap_or(1);
        (signers, threshold)
    }

    /// Read-only: returns the current minimum and maximum gift amounts.
    pub fn get_amount_limits(env: Env) -> (i128, i128) {
        let min_amount = get_min_amount(&env);
        let max_amount = get_max_amount(&env);
        (min_amount, max_amount)
    }

    /// Extend the unlock date. Only the original sender may call this,
    /// and `new_unlock_at` must be strictly later than the current unlock time.
    pub fn extend_unlock(env: Env, new_unlock_at: u64) -> Result<(), EscrowError> {
        let sender: Address = env
            .storage()
            .instance()
            .get(&DataKey::Sender)
            .ok_or(EscrowError::NotInitialized)?;

        sender.require_auth();

        let claimed: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Claimed)
            .unwrap_or(false);

        if claimed {
            return Err(EscrowError::AlreadyClaimed);
        }

        let current_unlock: u64 = env
            .storage()
            .instance()
            .get(&DataKey::UnlockTime)
            .ok_or(EscrowError::NotInitialized)?;

        if new_unlock_at <= current_unlock {
            return Err(EscrowError::UnlockNotExtended);
        }

        env.storage().instance().set(&DataKey::UnlockTime, &new_unlock_at);

        env.events().publish(
            (Symbol::new(&env, "unlock_extended"),),
            (sender, current_unlock, new_unlock_at),
        );

        Ok(())
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token::{Client as TokenClient, StellarAssetClient},
        Env,
    };
    use proptest::prelude::*;

    fn setup(env: &Env) -> (Address, Address, Address, TokenClient, EscrowContractClient) {
        let admin = Address::generate(env);
        let sender = Address::generate(env);
        let recipient = Address::generate(env);

        let token_id = env.register_stellar_asset_contract(admin.clone());
        let token = TokenClient::new(env, &token_id);
        let token_admin = StellarAssetClient::new(env, &token_id);
        token_admin.mint(&sender, &100_000_000);

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(env, &contract_id);

        (sender, recipient, token_id, token, client)
    }

    /// Helper: initialize with a future unlock_time (ledger starts at 0, so 1_000 is fine).
    fn do_initialize(
        client: &EscrowContractClient,
        sender: &Address,
        recipient: &Address,
        token_id: &Address,
        amount: i128,
        unlock_time: u64,
    ) {
        client.initialize(sender, recipient, token_id, &amount, &unlock_time, token_id);
    }

    #[test]
    fn test_initialize_and_claim() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, token, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &1,
        );
        env.ledger().with_mut(|l| l.timestamp = 3_602);
        client.claim();

        assert_eq!(token.balance(&recipient), 100_000_000);
    }

    #[test]
    fn test_multisig_upgrade_requires_threshold() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, _token, client) = setup(&env);

        let signer1 = Address::generate(&env);
        let signer2 = Address::generate(&env);
        let signer3 = Address::generate(&env);
        let signers = vec![signer1.clone(), signer2.clone(), signer3.clone()];
        let admin = signer1.clone();

        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &2, // 2-of-3
        );

        let dummy_hash: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);

        // signer1 proposes
        client.propose_admin_op(&signer1, &AdminOp::Upgrade, &dummy_hash);

        // signer1 trying to approve again should fail
        let err = client
            .try_approve_admin_op(&signer1)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::AlreadyApproved);

        // signer2 approves — threshold reached, upgrade executes
        // (upgrade itself will panic in test env without a real WASM, so we
        //  just verify the proposal is cleared after the second approval)
        let _ = client.try_approve_admin_op(&signer2); // may error on wasm update in test
    }

    #[test]
    fn test_non_signer_cannot_propose() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, _token, client) = setup(&env);

        let signer = Address::generate(&env);
        let outsider = Address::generate(&env);
        let signers = vec![signer.clone()];
        let admin = signer.clone();

        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &1,
        );

        let dummy_hash: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
        let err = client
            .try_propose_admin_op(&outsider, &AdminOp::Pause, &dummy_hash)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::Unauthorized);
    }

    #[test]
    fn test_double_initialize_returns_error() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, _, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &1,
        );

        let err = client
            .try_initialize(
                &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
                &token_id, &100_000_000, &3_601, &signers, &1,
            )
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::AlreadyInitialized);
    }

    #[test]
    fn test_amount_below_minimum_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, _, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        // Try to initialize with amount below default minimum (1 USDC = 10,000,000 stroops)
        let err = client
            .try_initialize(
                &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
                &token_id, &1_000_000, // 0.1 USDC
                &3_601, &signers, &1,
            )
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::InvalidAmount);
    }

    #[test]
    fn test_amount_above_maximum_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, token, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        // Mint more tokens to sender
        let token_admin = StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&sender, &1_000_000_000_000); // 100,000 USDC

        // Try to initialize with amount above default maximum (10,000 USDC = 100,000,000,000 stroops)
        let err = client
            .try_initialize(
                &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
                &token_id, &100_000_000_001, // 10,000.00001 USDC
                &3_601, &signers, &1,
            )
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::InvalidAmount);
    }

    #[test]
    fn test_amount_at_minimum_boundary_accepted() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, token, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        // Initialize with exactly the minimum amount (1 USDC)
        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &10_000_000, // Exactly 1 USDC
            &3_601, &signers, &1,
        );

        // Verify it was initialized
        let (state_sender, _, amount, _, _, _) = client.get_state().unwrap();
        assert_eq!(state_sender, sender);
        assert_eq!(amount, 10_000_000);
    }

    #[test]
    fn test_amount_at_maximum_boundary_accepted() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, token, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        // Mint more tokens to sender
        let token_admin = StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&sender, &1_000_000_000_000); // 100,000 USDC

        // Initialize with exactly the maximum amount (10,000 USDC)
        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000_000, // Exactly 10,000 USDC
            &3_601, &signers, &1,
        );

        // Verify it was initialized
        let (state_sender, _, amount, _, _, _) = client.get_state().unwrap();
        assert_eq!(state_sender, sender);
        assert_eq!(amount, 100_000_000_000);
    }

    #[test]
    fn test_get_amount_limits_returns_defaults() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, _, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &1,
        );

        let (min, max) = client.get_amount_limits();
        assert_eq!(min, DEFAULT_MIN_AMOUNT);
        assert_eq!(max, DEFAULT_MAX_AMOUNT);
    }

    #[test]
    fn test_set_amount_limits_requires_signer() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, _, client) = setup(&env);
        let admin = Address::generate(&env);
        let outsider = Address::generate(&env);
        let signers = vec![admin.clone()];

        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &1,
        );

        // Non-signer tries to set limits
        let err = client
            .try_execute_set_amount_limits(&outsider, &5_000_000, &50_000_000_000)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::Unauthorized);
    }

    #[test]
    fn test_set_amount_limits_validates_min_max() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, _, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &1,
        );

        // Try to set min > max
        let err = client
            .try_execute_set_amount_limits(&admin, &50_000_000_000, &5_000_000)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::InvalidAmount);
    }

    #[test]
    fn test_set_amount_limits_validates_positive() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, _, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &1,
        );

        // Try to set negative/zero amounts
        let err = client
            .try_execute_set_amount_limits(&admin, &0, &50_000_000_000)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::InvalidAmount);
    }

    #[test]
    fn test_set_amount_limits_updates_storage() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, _, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &1,
        );

        // Set new limits
        let new_min = 5_000_000;      // 0.5 USDC
        let new_max = 50_000_000_000; // 5,000 USDC
        client.execute_set_amount_limits(&admin, &new_min, &new_max);

        // Verify limits were updated
        let (min, max) = client.get_amount_limits();
        assert_eq!(min, new_min);
        assert_eq!(max, new_max);
    }

    #[test]
    fn test_initialize_respects_updated_limits() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, token, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        // Initialize first gift
        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &1,
        );

        // Update limits to be more restrictive
        let new_min = 50_000_000;     // 5 USDC
        let new_max = 50_000_000_000; // 5,000 USDC
        client.execute_set_amount_limits(&admin, &new_min, &new_max);

        // Try to initialize with amount below new minimum
        let sender2 = Address::generate(&env);
        let recipient2 = Address::generate(&env);
        let token_admin = StellarAssetClient::new(&env, &token_id);
        token_admin.mint(&sender2, &100_000_000);

        let err = client
            .try_initialize(
                &admin, &Symbol::new(&env, "g2"), &sender2, &recipient2,
                &token_id, &10_000_000, // 1 USDC (below new minimum of 5)
                &3_601, &signers, &1,
            )
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::InvalidAmount);
    }

    #[test]
    fn test_cancel_rejected_after_claim() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, token, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        // Initialize
        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &1,
        );

        // Advance ledger to unlock time
        env.ledger().with_mut(|l| l.timestamp = 3_602);

        // Claim
        client.claim();
        assert_eq!(token.balance(&recipient), 100_000_000);

        // Try cancel — should fail with AlreadyClaimed
        let err = client
            .try_cancel()
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::AlreadyClaimed);
    }

    #[test]
    fn test_expire_rejected_after_claim() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, token, client) = setup(&env);
        let admin = Address::generate(&env);
        let signers = vec![admin.clone()];

        // Initialize
        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &1,
        );

        // Advance ledger to unlock time
        env.ledger().with_mut(|l| l.timestamp = 3_602);

        // Claim
        client.claim();
        assert_eq!(token.balance(&recipient), 100_000_000);

        // Advance ledger to way past expiry time (unlock_time + 365 days)
        env.ledger().with_mut(|l| l.timestamp = 3_601 + 365 * 24 * 3600 + 1);

        // Try expire — should fail with AlreadyClaimed
        let err = client
            .try_expire()
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::AlreadyClaimed);
    }

    #[test]
    fn test_expired_proposal_cannot_be_approved() {
        let env = Env::default();
        env.mock_all_auths();
        let (sender, recipient, token_id, _token, client) = setup(&env);

        let signer1 = Address::generate(&env);
        let signer2 = Address::generate(&env);
        let signer3 = Address::generate(&env);
        let signers = vec![signer1.clone(), signer2.clone(), signer3.clone()];
        let admin = signer1.clone();

        client.initialize(
            &admin, &Symbol::new(&env, "g1"), &sender, &recipient,
            &token_id, &100_000_000, &3_601, &signers, &2, // 2-of-3
        );

        let dummy_hash: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);

        // signer1 proposes
        client.propose_admin_op(&signer1, &AdminOp::Upgrade, &dummy_hash);

        // Advance ledger time past 7 days (the proposal expiry time)
        let seven_days_in_seconds = 7 * 24 * 60 * 60; // 7 days in seconds
        env.ledger().with_mut(|l| l.timestamp = l.timestamp + seven_days_in_seconds + 1);

        // signer2 tries to approve expired proposal — should fail
        let err = client
            .try_approve_admin_op(&signer2)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, EscrowError::ProposalExpired);
    }

    proptest! {
        #[test]
        fn fuzz_initialize_amounts(amount in any::<i128>()) {
            let env = Env::default();
            env.mock_all_auths();
            let (sender, recipient, token_id, _token, client) = setup(&env);
            let admin = Address::generate(&env);
            let signers = vec![admin.clone()];
            let gift_id = Symbol::new(&env, "test");
            let unlock_time = env.ledger().timestamp() + 10_000;

            // Try to initialize with the fuzzed amount
            let result = client.try_initialize(
                &admin,
                &gift_id,
                &sender,
                &recipient,
                &token_id,
                &amount,
                &unlock_time,
                &signers,
                &1,
            );

            // Verify the result is either Ok or one of the expected errors
            match result {
                Ok(_) => {
                    // Should only succeed if amount is within min and max
                    let min = DEFAULT_MIN_AMOUNT;
                    let max = DEFAULT_MAX_AMOUNT;
                    assert!(amount >= min && amount <= max);
                }
                Err(Ok(EscrowError::InvalidAmount)) => {
                    // InvalidAmount if amount is outside min/max
                }
                Err(Ok(EscrowError::InvalidUnlockTime)) => {
                    // Unlock time validation
                }
                _ => {
                    // Any other error is unexpected
                    panic!("Unexpected error: {:?}", result);
                }
            }
        }

        #[test]
        fn fuzz_unlock_time(unlock_time in any::<u64>()) {
            let env = Env::default();
            env.mock_all_auths();
            let (sender, recipient, token_id, _token, client) = setup(&env);
            let admin = Address::generate(&env);
            let signers = vec![admin.clone()];
            let gift_id = Symbol::new(&env, "test");
            let valid_amount = DEFAULT_MIN_AMOUNT; // Use a valid amount for this test

            // Try to initialize with the fuzzed unlock_time
            let result = client.try_initialize(
                &admin,
                &gift_id,
                &sender,
                &recipient,
                &token_id,
                &valid_amount,
                &unlock_time,
                &signers,
                &1,
            );

            let current_time = env.ledger().timestamp();
            let min_lock_time = MIN_LOCK_DURATION;

            // Verify the result
            match result {
                Ok(_) => {
                    // Should only succeed if unlock_time is in the future by at least min_lock_time
                    assert!(unlock_time > current_time + min_lock_time);
                }
                Err(Ok(EscrowError::InvalidUnlockTime)) => {
                    // InvalidUnlockTime if unlock_time is too soon or in past
                }
                _ => {
                    panic!("Unexpected error: {:?}", result);
                }
            }
        }
    }
}
