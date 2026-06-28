/**
 * @file schemas.ts
 * Backward-compatibility re-export shim.
 *
 * Schema definitions live in `src/lib/schemas/` so they can be shared between
 * frontend and backend. Existing imports from `@/types/schemas` continue to
 * work through this file.
 */

import type { z } from "zod";
import type {
  claimGiftSchema as claimGiftSchemaType,
  createGiftSchema as createGiftSchemaType,
  verifyOtpSchema as verifyOtpSchemaType,
  createGroupGiftSchema as createGroupGiftSchemaType,
  contributeSchema as contributeSchemaType,
} from "@/lib/schemas";

export {
  createGiftSchema,
  verifyOtpSchema,
  claimGiftSchema,
  createGroupGiftSchema,
  contributeSchema,
} from "@/lib/schemas";

export type CreateGiftInput = z.input<typeof createGiftSchemaType>;
export type VerifyOtpInput = z.input<typeof verifyOtpSchemaType>;
export type ClaimGiftInput = z.input<typeof claimGiftSchemaType>;
export type CreateGroupGiftInput = z.input<typeof createGroupGiftSchemaType>;
export type ContributeInput = z.input<typeof contributeSchemaType>;
