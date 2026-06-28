/**
 * @jest-environment node
 *
 * Integration test — Gift factory status variants (#648)
 *
 * Verifies that every GiftStatus variant produced by giftFactory:
 *  - carries the correct status field
 *  - has realistic timestamps (unlockAt in past for claimed/expired/unlocked)
 *  - includes a valid Stellar address for the recipient field where required
 *  - can be used as a drop-in replacement for hardcoded SQL inserts
 */

import {
  createTestGift,
  createDraftGift,
  createPendingPaymentGift,
  createFundedGift,
  createLockedGift,
  createUnlockedGift,
  createClaimedGift,
  createExpiredGift,
  createCancelledGift,
  createAllStatusGifts,
} from '@/lib/factories/giftFactory';
import type { GiftStatus } from '@/types';

// Stellar public key validation — G... followed by 55 base32 chars = 56 total
const STELLAR_KEY_RE = /^G[A-Z2-7]{55}$/;

describe('giftFactory — all status variants', () => {
  const now = Date.now();

  it('createDraftGift → status=draft, unlockAt in future', () => {
    const g = createDraftGift();
    expect(g.status).toBe<GiftStatus>('draft');
    expect(g.unlockAt.getTime()).toBeGreaterThan(now);
  });

  it('createPendingPaymentGift → status=pending_payment, unlockAt in future', () => {
    const g = createPendingPaymentGift();
    expect(g.status).toBe<GiftStatus>('pending_payment');
    expect(g.unlockAt.getTime()).toBeGreaterThan(now);
  });

  it('createFundedGift → status=funded, has stellarTxHash and contractId', () => {
    const g = createFundedGift();
    expect(g.status).toBe<GiftStatus>('funded');
    expect(g.stellarTxHash).toBeTruthy();
    expect(g.contractId).toBeTruthy();
  });

  it('createLockedGift → status=locked, unlockAt in future', () => {
    const g = createLockedGift();
    expect(g.status).toBe<GiftStatus>('locked');
    expect(g.unlockAt.getTime()).toBeGreaterThan(now);
  });

  it('createUnlockedGift → status=unlocked, unlockAt in past', () => {
    const g = createUnlockedGift();
    expect(g.status).toBe<GiftStatus>('unlocked');
    expect(g.unlockAt.getTime()).toBeLessThan(now);
  });

  it('createClaimedGift → status=claimed, unlockAt in past, claimTxHash present, valid Stellar address', () => {
    const g = createClaimedGift();
    expect(g.status).toBe<GiftStatus>('claimed');
    expect(g.unlockAt.getTime()).toBeLessThan(now);
    expect(g.claimTxHash).toBeTruthy();
    // recipientEmail is overloaded with Stellar address in claimed variant
    expect(STELLAR_KEY_RE.test(g.recipientEmail!)).toBe(true);
  });

  it('createExpiredGift → status=expired, unlockAt in past', () => {
    const g = createExpiredGift();
    expect(g.status).toBe<GiftStatus>('expired');
    expect(g.unlockAt.getTime()).toBeLessThan(now);
  });

  it('createCancelledGift → status=cancelled', () => {
    const g = createCancelledGift();
    expect(g.status).toBe<GiftStatus>('cancelled');
  });

  it('createAllStatusGifts → returns a gift for every GiftStatus', () => {
    const all = createAllStatusGifts();
    const statuses: GiftStatus[] = [
      'draft',
      'pending_payment',
      'funded',
      'locked',
      'unlocked',
      'claimed',
      'expired',
      'cancelled',
    ];
    for (const s of statuses) {
      expect(all[s]).toBeDefined();
      expect(all[s].status).toBe(s);
    }
  });

  it('each factory call generates a unique id', () => {
    const ids = Array.from({ length: 20 }, () => createTestGift().id);
    expect(new Set(ids).size).toBe(20);
  });

  it('overrides are applied correctly', () => {
    const g = createFundedGift({ amountNgn: 99999, recipientName: 'Override Test' });
    expect(g.status).toBe('funded');
    expect(g.amountNgn).toBe(99999);
    expect(g.recipientName).toBe('Override Test');
  });
});
