/**
 * @jest-environment node
 *
 * Unit tests for POST /api/v1/uploads MIME-type and size validation.
 */

jest.mock("@/server/middleware", () => ({
  withErrorHandler: (handler: any, _opts?: any) => handler,
  withCsrf: (handler: any) => handler,
}));

jest.mock("@/lib/csrf", () => ({ withCsrf: (h: any) => h }));

describe("POST /api/v1/uploads – MIME-type validation", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    process.env.CLOUDINARY_API_SECRET = "test-secret";
    process.env.CLOUDINARY_API_KEY = "test-key";
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    ({ POST } = await import("@/app/api/v1/uploads/route"));
  });

  function buildRequest(file: File): Request {
    const form = new FormData();
    form.append("file", file);
    return new Request("http://localhost/api/v1/uploads", {
      method: "POST",
      body: form,
    });
  }

  it("rejects disallowed MIME types with 400", async () => {
    const forbidden = [
      "application/pdf",
      "text/html",
      "image/svg+xml",
      "application/javascript",
      "video/mp4",
    ];

    for (const mime of forbidden) {
      const file = new File(["x"], "evil.bin", { type: mime });
      const res = await POST(buildRequest(file) as any);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/Invalid file type/);
    }
  });

  it("rejects images larger than 5 MB with 400", async () => {
    const buf = new ArrayBuffer(5 * 1024 * 1024 + 1);
    const file = new File([buf], "big.png", { type: "image/png" });
    const res = await POST(buildRequest(file) as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/size limit/);
  });

  it("rejects audio larger than 10 MB with 400", async () => {
    const buf = new ArrayBuffer(10 * 1024 * 1024 + 1);
    const file = new File([buf], "big.webm", { type: "audio/webm" });
    const res = await POST(buildRequest(file) as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/size limit/);
  });
});
