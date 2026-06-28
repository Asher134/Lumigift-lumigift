/*
Integration tests for the gift creation flow.
These tests cover:
- Successful gift creation with mocked Paystack payment initialization.
- Gift creation failure when Paystack initialization throws.
- Idempotent handling of duplicate payment references.
- Gift not created if Stellar transaction (mocked escrow client) fails.

The in‑memory `gifts` map from `gift.service.ts` is cleared before each test to ensure isolation.
*/

import { POST } from '@/app/api/v1/gifts/route';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { initializePayment } from '@/lib/paystack';
import { sendGiftInvitation } from '@/lib/sms';
import { sendGiftReceivedEmail } from '@/lib/email';
import { gifts } from '@/server/services/gift.service';

jest.mock('next-auth');
jest.mock('@/lib/paystack');
jest.mock('@/lib/sms');
jest.mock('@/lib/email');

const mockSession = { user: { id: 'user-123' } } as any;

beforeEach(() => {
  // Reset the in‑memory store.
  (gifts as unknown as Map<string, any>).clear();
  jest.clearAllMocks();
  (getServerSession as jest.Mock).mockResolvedValue(mockSession);
});

function createRequest(body: any): NextRequest {
  const json = JSON.stringify(body);
  const req = new NextRequest('http://localhost/api/v1/gifts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
  });
  return req as unknown as NextRequest; // cast for test purposes
}

describe('Gift creation integration', () => {
  it('creates a gift successfully and returns a payment URL', async () => {
    (initializePayment as jest.Mock).mockResolvedValue({ authorizationUrl: 'https://paystack.com/checkout' });
    const payload = {
      amountNgn: 5000,
      recipientPhone: '+2348012345678',
      recipientName: 'Valentine',
      unlockAt: new Date().toISOString(),
      occasion: 'valentine',
      paymentProvider: 'paystack',
    };
    const req = createRequest(payload);
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.gift).toBeDefined();
    expect(json.data.paymentUrl).toBe('https://paystack.com/checkout');
    // Gift should be stored in the in‑memory map.
    expect(gifts.size).toBe(1);
  });

  it('fails to create a gift when Paystack initialization throws', async () => {
    (initializePayment as jest.Mock).mockRejectedValue(new Error('Paystack service down'));
    const payload = {
      amountNgn: 5000,
      recipientPhone: '+2348012345678',
      recipientName: 'Valentine',
      unlockAt: new Date().toISOString(),
      occasion: 'valentine',
      paymentProvider: 'paystack',
    };
    const req = createRequest(payload);
    const res = await POST(req);
    // The service translates the error into a 500 response.
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(gifts.size).toBe(0);
  });

  it('handles duplicate payment reference idempotently', async () => {
    // First call succeeds.
    (initializePayment as jest.Mock).mockResolvedValue({ authorizationUrl: 'https://paystack.com/checkout' });
    const payload = {
      amountNgn: 5000,
      recipientPhone: '+2348012345678',
      recipientName: 'Valentine',
      unlockAt: new Date().toISOString(),
      occasion: 'valentine',
      paymentProvider: 'paystack',
    };
    const req1 = createRequest(payload);
    await POST(req1);
    expect(gifts.size).toBe(1);
    const createdGiftId = Array.from(gifts.keys())[0];

    // Simulate a duplicate request with the same reference (gift id).
    // The service generates a new UUID each call, so we mock randomUUID to return the same id.
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValueOnce(createdGiftId).mockReturnValueOnce(createdGiftId);
    const req2 = createRequest(payload);
    const res2 = await POST(req2);
    // Should still respond with 201 and not create a second gift.
    expect(res2.status).toBe(201);
    expect(gifts.size).toBe(1);
  });

  it('does not create a gift if Stellar escrow client throws', async () => {
    // Mock the escrow client used inside createGift (not directly exported).
    // The module '@/lib/contracts/escrow-client' is imported inside the service – we stub it to throw.
    jest.mock('@/lib/contracts/escrow-client', () => ({
      createEscrow: jest.fn().mockRejectedValue(new Error('Stellar error')),
    }));
    (initializePayment as jest.Mock).mockResolvedValue({ authorizationUrl: 'https://paystack.com/checkout' });
    const payload = {
      amountNgn: 5000,
      recipientPhone: '+2348012345678',
      recipientName: 'Valentine',
      unlockAt: new Date().toISOString(),
      occasion: 'valentine',
      paymentProvider: 'paystack',
    };
    const req = createRequest(payload);
    const res = await POST(req);
    // Expect the handler to surface the Stellar error as a 500.
    expect(res.status).toBe(500);
    expect(gifts.size).toBe(0);
  });
});
