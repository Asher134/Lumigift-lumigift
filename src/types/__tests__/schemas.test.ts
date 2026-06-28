import {
  ALLOWED_MIME_TYPES,
  adminGiftsQuerySchema,
  allowedMimeTypeSchema,
  auditEventTypeSchema,
  auditLogsQuerySchema,
  claimGiftSchema,
  createGiftSchema,
  cursorPaginationSchema,
  e164Phone,
  giftIdParamSchema,
  giftStatusSchema,
  giftsQuerySchema,
  isoDateSchema,
  paginationSchema,
  paystackCallbackQuerySchema,
  paystackWebhookSchema,
  registerBodySchema,
  reportLoginBodySchema,
  reportLoginQuerySchema,
  sendOtpBodySchema,
  userExistsQuerySchema,
  uuidSchema,
  verifyOtpSchema,
} from "@/lib/schemas";
import {
  claimGiftSchema as shimClaimGiftSchema,
  createGiftSchema as shimCreateGiftSchema,
  verifyOtpSchema as shimVerifyOtpSchema,
} from "../schemas";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const STELLAR_KEY = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const FUTURE_ISO = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST_ISO = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const validGiftInput = () => ({
  recipientPhone: "08012345678",
  recipientName: "John Doe",
  amountNgn: 1_000,
  message: "Happy Birthday!",
  unlockAt: FUTURE_ISO(),
  paymentProvider: "paystack" as const,
});

describe("schema compatibility exports", () => {
  it("keeps the legacy @/types/schemas shim pointed at the shared schemas", () => {
    expect(shimCreateGiftSchema).toBe(createGiftSchema);
    expect(shimVerifyOtpSchema).toBe(verifyOtpSchema);
    expect(shimClaimGiftSchema).toBe(claimGiftSchema);
  });
});

describe("common schemas", () => {
  it("validates UUIDs and rejects malformed identifiers", () => {
    expect(uuidSchema.safeParse(UUID).success).toBe(true);
    expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  it("normalizes supported E.164 phone inputs and rejects invalid phones", () => {
    expect(e164Phone.safeParse("08012345678").data).toBe("+2348012345678");
    expect(e164Phone.safeParse("+14155552671").data).toBe("+14155552671");
    expect(e164Phone.safeParse("123").success).toBe(false);
    expect(e164Phone.safeParse(null).success).toBe(false);
  });

  it("parses ISO dates and rejects invalid date strings", () => {
    const parsed = isoDateSchema.safeParse("2026-05-30T10:00:00.000Z");

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBeInstanceOf(Date);
    }
    expect(isoDateSchema.safeParse("not-a-date").success).toBe(false);
  });

  it("coerces pagination defaults and rejects out-of-range values", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, limit: 10 });
    expect(paginationSchema.parse({ page: "2", limit: "25" })).toEqual({ page: 2, limit: 25 });
    expect(paginationSchema.safeParse({ page: "0" }).success).toBe(false);
    expect(paginationSchema.safeParse({ limit: "101" }).success).toBe(false);

    expect(cursorPaginationSchema.parse({})).toEqual({ pageSize: 10 });
    expect(cursorPaginationSchema.parse({ cursor: "abc", pageSize: "50" })).toEqual({
      cursor: "abc",
      pageSize: 50,
    });
    expect(cursorPaginationSchema.safeParse({ pageSize: "101" }).success).toBe(false);
  });
});

describe("auth schemas", () => {
  it("validates registration and normalizes phone numbers", () => {
    const result = registerBodySchema.safeParse({
      phone: "08012345678",
      displayName: "Ada Lovelace",
      invitationToken: "invite-token",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phone).toBe("+2348012345678");
      expect(result.data.displayName).toBe("Ada Lovelace");
    }
  });

  it("rejects invalid registration edge cases", () => {
    expect(registerBodySchema.safeParse({ phone: "", displayName: "A" }).success).toBe(false);
    expect(registerBodySchema.safeParse({ phone: "08012345678", displayName: "" }).success).toBe(
      false
    );
    expect(
      registerBodySchema.safeParse({
        phone: "08012345678",
        displayName: "<script>alert(1)</script>",
        invitationToken: "",
      }).success
    ).toBe(false);
  });

  it("validates OTP request and verification bodies", () => {
    expect(sendOtpBodySchema.safeParse({ phone: "+2348012345678" }).success).toBe(true);
    expect(sendOtpBodySchema.safeParse({ phone: "nope" }).success).toBe(false);

    expect(verifyOtpSchema.safeParse({ phone: "+2348012345678", otp: "123456" }).success).toBe(
      true
    );
    expect(verifyOtpSchema.safeParse({ phone: "+2348012345678", otp: "12345" }).success).toBe(
      false
    );
    expect(verifyOtpSchema.safeParse({ phone: "+2348012345678", otp: "ABCDEF" }).success).toBe(
      false
    );
  });

  it("validates suspicious-login report body and query schemas", () => {
    expect(
      reportLoginBodySchema.safeParse({ userId: UUID, fingerprint: "device-fp" }).success
    ).toBe(true);
    expect(reportLoginBodySchema.safeParse({ userId: UUID, fingerprint: "" }).success).toBe(false);
    expect(reportLoginQuerySchema.safeParse({ uid: UUID, fp: "device-fp" }).success).toBe(true);
    expect(reportLoginQuerySchema.safeParse({ uid: "bad", fp: "device-fp" }).success).toBe(false);
  });
});

describe("gift schemas", () => {
  it("validates gift creation and applies schema transforms/defaults", () => {
    const result = createGiftSchema.safeParse({
      ...validGiftInput(),
      recipientEmail: "",
      recipientIsRegistered: false,
      notifyAt: FUTURE_ISO(),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recipientPhone).toBe("+2348012345678");
      expect(result.data.recipientEmail).toBeUndefined();
      expect(result.data.occasion).toBe("general");
    }
  });

  it("rejects missing fields, wrong types, nulls, and empty required strings", () => {
    expect(createGiftSchema.safeParse({ amountNgn: 1_000 }).success).toBe(false);
    expect(createGiftSchema.safeParse({ ...validGiftInput(), amountNgn: "1000" }).success).toBe(
      false
    );
    expect(createGiftSchema.safeParse({ ...validGiftInput(), recipientName: "" }).success).toBe(
      false
    );
    expect(createGiftSchema.safeParse({ ...validGiftInput(), message: null }).success).toBe(false);
  });

  it("rejects amount, date, notification, provider, and URL edge cases", () => {
    expect(createGiftSchema.safeParse({ ...validGiftInput(), amountNgn: 499 }).success).toBe(false);
    expect(createGiftSchema.safeParse({ ...validGiftInput(), amountNgn: 500_001 }).success).toBe(
      false
    );
    expect(createGiftSchema.safeParse({ ...validGiftInput(), unlockAt: PAST_ISO() }).success).toBe(
      false
    );
    expect(
      createGiftSchema.safeParse({
        ...validGiftInput(),
        unlockAt: FUTURE_ISO(),
        notifyAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      }).success
    ).toBe(false);
    expect(
      createGiftSchema.safeParse({ ...validGiftInput(), paymentProvider: "cash" }).success
    ).toBe(false);
    expect(
      createGiftSchema.safeParse({ ...validGiftInput(), voiceNoteUrl: "not-a-url" }).success
    ).toBe(false);
  });

  it("accepts XSS-looking message text as plain content while enforcing length limits", () => {
    expect(
      createGiftSchema.safeParse({ ...validGiftInput(), message: "<script>alert(1)</script>" })
        .success
    ).toBe(true);
    expect(
      createGiftSchema.safeParse({ ...validGiftInput(), message: "a".repeat(281) }).success
    ).toBe(false);
  });

  it("validates gift query, status, path param, and claim schemas", () => {
    expect(giftStatusSchema.safeParse("funded").success).toBe(true);
    expect(giftStatusSchema.safeParse("unknown").success).toBe(false);
    expect(giftIdParamSchema.safeParse({ id: UUID }).success).toBe(true);
    expect(giftIdParamSchema.safeParse({ id: "bad" }).success).toBe(false);

    expect(giftsQuerySchema.parse({ page: "2", limit: "20", status: "funded" })).toMatchObject({
      page: 2,
      limit: 20,
      status: "funded",
    });
    expect(giftsQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(giftsQuerySchema.safeParse({ status: "unknown" }).success).toBe(false);

    expect(
      claimGiftSchema.safeParse({ giftId: UUID, recipientStellarKey: STELLAR_KEY }).success
    ).toBe(true);
    expect(
      claimGiftSchema.safeParse({ giftId: "bad", recipientStellarKey: STELLAR_KEY }).success
    ).toBe(false);
    expect(claimGiftSchema.safeParse({ giftId: UUID, recipientStellarKey: "G123" }).success).toBe(
      false
    );
  });
});

describe("payment schemas", () => {
  it("validates Paystack callback query params", () => {
    expect(
      paystackCallbackQuerySchema.safeParse({ reference: "pay-ref", giftId: UUID }).success
    ).toBe(true);
    expect(paystackCallbackQuerySchema.safeParse({ reference: "", giftId: UUID }).success).toBe(
      false
    );
    expect(
      paystackCallbackQuerySchema.safeParse({ reference: "pay-ref", giftId: "bad" }).success
    ).toBe(false);
  });

  it("validates Paystack webhook payload shape", () => {
    expect(
      paystackWebhookSchema.safeParse({
        event: "charge.success",
        data: { reference: "pay-ref", status: "success", metadata: { giftId: UUID } },
      }).success
    ).toBe(true);
    expect(
      paystackWebhookSchema.safeParse({
        event: "",
        data: { reference: "pay-ref", status: "success" },
      }).success
    ).toBe(false);
    expect(
      paystackWebhookSchema.safeParse({
        event: "charge.success",
        data: { reference: "", status: "success" },
      }).success
    ).toBe(false);
    expect(
      paystackWebhookSchema.safeParse({
        event: "charge.success",
        data: { reference: "pay-ref", status: "" },
      }).success
    ).toBe(false);
  });
});

describe("admin and user schemas", () => {
  it("validates admin audit filters and transforms date/number fields", () => {
    const result = auditLogsQuerySchema.safeParse({
      userId: UUID,
      eventType: "gift_created",
      startDate: "2026-05-01T00:00:00.000Z",
      endDate: "2026-05-30T00:00:00.000Z",
      limit: "25",
      offset: "5",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startDate).toBeInstanceOf(Date);
      expect(result.data.limit).toBe(25);
      expect(result.data.offset).toBe(5);
    }

    expect(auditEventTypeSchema.safeParse("payment_failed").success).toBe(true);
    expect(auditEventTypeSchema.safeParse("unknown").success).toBe(false);
    expect(auditLogsQuerySchema.safeParse({ startDate: "bad-date" }).success).toBe(false);
    expect(auditLogsQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
  });

  it("validates admin gift filters and user lookup query", () => {
    expect(
      adminGiftsQuerySchema.safeParse({ search: "<script>", status: "funded", limit: "10" }).success
    ).toBe(true);
    expect(adminGiftsQuerySchema.safeParse({ status: "unknown" }).success).toBe(false);
    expect(adminGiftsQuerySchema.safeParse({ search: "a".repeat(201) }).success).toBe(false);

    expect(userExistsQuerySchema.safeParse({ phone: "08012345678" }).success).toBe(true);
    expect(userExistsQuerySchema.safeParse({ phone: "" }).success).toBe(false);
    expect(userExistsQuerySchema.safeParse({ phone: undefined }).success).toBe(false);
  });
});

describe("upload schemas", () => {
  it("accepts the configured image MIME types and rejects unsupported inputs", () => {
    for (const mimeType of ALLOWED_MIME_TYPES) {
      expect(allowedMimeTypeSchema.safeParse(mimeType).success).toBe(true);
    }

    expect(allowedMimeTypeSchema.safeParse("image/svg+xml").success).toBe(false);
    expect(allowedMimeTypeSchema.safeParse(null).success).toBe(false);
  });
});
