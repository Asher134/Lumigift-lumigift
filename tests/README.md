# Integration Tests for Gift Creation and Payment Flow

This README describes how to run the integration tests that simulate the full gift creation pipeline:
- Form submission via the API endpoint (`POST /api/v1/gifts`).
- Mocked Paystack payment initialization.
- Mocked Stellar transaction handling.
- Verification that a gift record is stored in the in‑memory store.

## Test Files
- `src/__tests__/integration/gift_creation.integration.test.ts` – covers successful creation, payment failure, duplicate idempotency, and Stellar failure scenarios.
- Factories in `src/lib/factories/` provide reusable test data (`createTestUser`, `createTestGift`).

## Running the Tests
```bash
# Ensure environment points to the test DB (if applicable)
export DATABASE_URL="postgres://test_user:password@localhost:5432/lumigift_test"

# Run only the integration suite
npm run test -- src/__tests__/integration/gift_creation.integration.test.ts
```
The tests operate against the in‑memory `gifts` map, so no production data is touched.

## Adding More Tests
1. Create a new file under `src/__tests__/integration/`.
2. Import the factories:
   ```ts
   import { createTestUser } from '@/lib/factories/userFactory';
   import { createTestGift } from '@/lib/factories/giftFactory';
   ```
3. Mock external services (Paystack, SMS, Email, Stellar) with `jest.mock`.
4. Use the same pattern of constructing a `NextRequest` and calling the API handler.

---
*These integration tests are safe for the staging environment because all external dependencies are mocked.*
