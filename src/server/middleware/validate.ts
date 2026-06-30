/**
 * @file validate.ts
 * Reusable Zod validation helper for Next.js API route handlers.
 *
 * Usage:
 *   const result = validateRequest(MySchema, rawInput);
 *   if (!result.success) return result.errorResponse;
 *   const { data } = result; // fully typed & validated
 *
 * The helper returns a discriminated union so TypeScript narrows the
 * type at the call-site without any casting.
 */

import { NextResponse } from "next/server";
import { z, ZodError, ZodSchema } from "zod";
import { getCorrelationId } from "@/lib/logger";
import type { ApiValidationError } from "@/types";

// ─── Error formatting ─────────────────────────────────────────────────────────

export function formatZodErrors(
  error: ZodError
): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function validationErrorResponse(error: ZodError, correlationId = "unknown"): NextResponse<ApiValidationError> {
  const res = NextResponse.json<ApiValidationError>(
    {
      success: false,
      error: { code: "VALIDATION_ERROR" as const, message: "Validation failed" as const, correlationId },
      errors: formatZodErrors(error),
    },
    { status: 400 }
  );
  res.headers.set("x-correlation-id", correlationId);
  return res;
}

// ─── Discriminated-union result type ─────────────────────────────────────────

type ValidationSuccess<T> = { success: true; data: T };
type ValidationFailure = {
  success: false;
  errorResponse: NextResponse<ApiValidationError>;
};
type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

// ─── Core helper ─────────────────────────────────────────────────────────────

/**
 * Validates `input` against `schema` using Zod's `safeParse`.
 *
 * @returns A discriminated union:
 *   - `{ success: true, data }` — input is valid; `data` is the parsed/typed value.
 *   - `{ success: false, errorResponse }` — input is invalid; `errorResponse` is a
 *     ready-to-return 400 `NextResponse`.
 *
 * @example
 * ```ts
 * const result = validateRequest(registerBodySchema, await req.json());
 * if (!result.success) return result.errorResponse;
 * const { phone, displayName } = result.data;
 * ```
 */
export function validateRequest<TSchema extends ZodSchema>(
  schema: TSchema,
  input: unknown,
  correlationId?: string
): ValidationResult<z.infer<TSchema>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, errorResponse: validationErrorResponse(parsed.error, correlationId) };
  }
  return { success: true, data: parsed.data };
}

/**
 * Converts a `URLSearchParams` (or `ReadonlyURLSearchParams`) object into a
 * plain record of strings, suitable for passing directly to `validateRequest`.
 *
 * @example
 * ```ts
 * const result = validateRequest(giftsQuerySchema, searchParamsToObject(req.nextUrl.searchParams));
 * ```
 */
export function searchParamsToObject(
  params: URLSearchParams | { get(key: string): string | null; forEach(fn: (value: string, key: string) => void): void }
): Record<string, string> {
  const obj: Record<string, string> = {};
  params.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}
