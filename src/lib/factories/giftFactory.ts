import type { Gift, GiftStatus, OccasionCategory } from '@/types';
import { createHash } from 'crypto';

/** SHA-256 hash of a dummy phone — never used outside tests. */
function dummyPhoneHash(): string {
  return createHash('sha256').update('+2348012345678').digest('hex');
}

/**
 * Valid Stellar public key used for recipient field in test fixtures.
 * This is the well-known Stellar testnet friendbot address.
 */
const TEST_STELLAR_ADDRESS = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);   // 1 week ahead
const PAST   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);   // 1 week ago

/**
 * Base factory — create a test Gift with optional field overrides.
 */
export function createTestGift(overrides?: Partial<Gift>): Gift {
  const base: Gift = {
    id: `gift-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderId: `user-${Date.now()}`,
    recipientPhoneHash: dummyPhoneHash(),
    recipientName: 'Test Recipient',
    recipientEmail: 'recipient@example.com',
    amountNgn: 5000,
    amountUsdc: '10.0000000',
    message: 'Happy testing',
    voiceNoteUrl: undefined,
    mediaUrl: undefined,
    unlockAt: FUTURE,
    status: 'pending_payment' as GiftStatus,
    occasion: 'general' as OccasionCategory,
    notifyAt: undefined,
    contractId: undefined,
    stellarTxHash: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: undefined,
  };
  return { ...base, ...overrides };
}

// ─── Status-specific factory variants ────────────────────────────────────────

/** Draft gift — not yet submitted for payment. */
export function createDraftGift(overrides?: Partial<Gift>): Gift {
  return createTestGift({ status: 'draft', unlockAt: FUTURE, ...overrides });
}

/** Pending payment — created, awaiting Paystack/Stripe confirmation. */
export function createPendingPaymentGift(overrides?: Partial<Gift>): Gift {
  return createTestGift({ status: 'pending_payment', unlockAt: FUTURE, ...overrides });
}

/** Funded — payment confirmed, funds held in escrow. */
export function createFundedGift(overrides?: Partial<Gift>): Gift {
  return createTestGift({
    status: 'funded',
    unlockAt: FUTURE,
    stellarTxHash: 'abc123fundedtxhash',
    contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCN4',
    ...overrides,
  });
}

/** Locked — time-lock active, unlock date in the future. */
export function createLockedGift(overrides?: Partial<Gift>): Gift {
  return createTestGift({
    status: 'locked',
    unlockAt: FUTURE,
    stellarTxHash: 'abc123lockedtxhash',
    contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCN4',
    ...overrides,
  });
}

/** Unlocked — unlock date has passed, ready to be claimed. */
export function createUnlockedGift(overrides?: Partial<Gift>): Gift {
  return createTestGift({
    status: 'unlocked',
    unlockAt: PAST,
    stellarTxHash: 'abc123unlockedtxhash',
    contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCN4',
    ...overrides,
  });
}

/** Claimed — recipient has claimed the gift; claimTxHash present. */
export function createClaimedGift(overrides?: Partial<Gift>): Gift {
  return createTestGift({
    status: 'claimed',
    unlockAt: PAST,
    stellarTxHash: 'abc123fundedtxhash',
    claimTxHash: 'abc123claimedtxhash',
    contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCN4',
    // recipient Stellar address set to valid testnet key
    recipientEmail: TEST_STELLAR_ADDRESS,
    ...overrides,
  });
}

/** Expired — unlock date passed and gift was never claimed. */
export function createExpiredGift(overrides?: Partial<Gift>): Gift {
  return createTestGift({
    status: 'expired',
    unlockAt: PAST,
    stellarTxHash: 'abc123expiredtxhash',
    contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCN4',
    ...overrides,
  });
}

/** Cancelled — sender cancelled before unlock. */
export function createCancelledGift(overrides?: Partial<Gift>): Gift {
  return createTestGift({ status: 'cancelled', unlockAt: FUTURE, ...overrides });
}

/**
 * Returns one factory-built gift for every GiftStatus value.
 * Useful for table-driven tests that exercise all status transitions.
 */
export function createAllStatusGifts(): Record<GiftStatus, Gift> {
  return {
    draft: createDraftGift(),
    pending_payment: createPendingPaymentGift(),
    funded: createFundedGift(),
    locked: createLockedGift(),
    unlocked: createUnlockedGift(),
    claimed: createClaimedGift(),
    expired: createExpiredGift(),
    cancelled: createCancelledGift(),
  };
}
