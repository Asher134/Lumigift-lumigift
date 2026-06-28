/**
 * Unit tests for useCsrf hook (issue #647).
 *
 * Uses jest.fn() to mock globalThis.fetch since MSW is not installed.
 * Covers: token fetching on mount, x-csrf-token header attachment,
 * deduplication, caching, 403 CSRF_INVALID invalidation, and 401 retry.
 */
import { renderHook, act } from "@testing-library/react";
import { useCsrf, invalidateCsrfToken } from "@/hooks/useCsrf";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal fetch Response-like mock that satisfies the hook's usage. */
function makeFetchResponse(status: number, body: unknown) {
  const jsonStr = JSON.stringify(body);
  const response = {
    status,
    ok: status >= 200 && status < 300,
    json: jest.fn().mockResolvedValue(body),
    clone: jest.fn(),
    headers: new Map<string, string>(),
  };
  // clone().json() used in 403 branch
  response.clone.mockReturnValue({ json: jest.fn().mockResolvedValue(body) });
  return response;
}

function csrfOkResponse(token = "test-csrf-token-abc") {
  return makeFetchResponse(200, { data: { csrfToken: token } });
}

function apiOkResponse() {
  return makeFetchResponse(200, {});
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let fetchMock: jest.Mock;

beforeEach(() => {
  invalidateCsrfToken();
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as typeof fetch;
});

afterEach(() => {
  // restore original fetch if any
  delete (globalThis as Record<string, unknown>).fetch;
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useCsrf", () => {
  const TOKEN = "test-csrf-token-abc";
  const FRESH_TOKEN = "fresh-csrf-token-xyz";

  it("fetches CSRF token on first csrfFetch call", async () => {
    fetchMock.mockImplementation((input: string) => {
      if (input === "/api/v1/csrf") return Promise.resolve(csrfOkResponse());
      return Promise.resolve(apiOkResponse());
    });

    const { result } = renderHook(() => useCsrf());
    await act(async () => { await result.current.csrfFetch("/api/test"); });

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/csrf", { credentials: "same-origin" });
  });

  it("attaches x-csrf-token header to wrapped requests", async () => {
    fetchMock.mockImplementation((input: string) => {
      if (input === "/api/v1/csrf") return Promise.resolve(csrfOkResponse());
      return Promise.resolve(apiOkResponse());
    });

    const { result } = renderHook(() => useCsrf());
    await act(async () => { await result.current.csrfFetch("/api/test"); });

    const apiCall = fetchMock.mock.calls.find(([url]: string[]) => url === "/api/test");
    expect(apiCall).toBeDefined();
    const headers: Headers = apiCall![1].headers;
    expect(headers.get("x-csrf-token")).toBe(TOKEN);
  });

  it("deduplicates concurrent token fetch calls", async () => {
    fetchMock.mockImplementation((input: string) => {
      if (input === "/api/v1/csrf") return Promise.resolve(csrfOkResponse());
      return Promise.resolve(apiOkResponse());
    });

    const { result } = renderHook(() => useCsrf());
    await act(async () => {
      await Promise.all([
        result.current.csrfFetch("/api/a"),
        result.current.csrfFetch("/api/b"),
      ]);
    });

    const csrfCalls = fetchMock.mock.calls.filter(([url]: string[]) => url === "/api/v1/csrf");
    expect(csrfCalls).toHaveLength(1);
  });

  it("caches token across sequential csrfFetch calls", async () => {
    fetchMock.mockImplementation((input: string) => {
      if (input === "/api/v1/csrf") return Promise.resolve(csrfOkResponse());
      return Promise.resolve(apiOkResponse());
    });

    const { result } = renderHook(() => useCsrf());
    await act(async () => {
      await result.current.csrfFetch("/api/test");
      await result.current.csrfFetch("/api/test");
    });

    const csrfCalls = fetchMock.mock.calls.filter(([url]: string[]) => url === "/api/v1/csrf");
    expect(csrfCalls).toHaveLength(1);
  });

  it("invalidates token on 403 CSRF_INVALID response", async () => {
    let apiCallCount = 0;
    fetchMock.mockImplementation((input: string) => {
      if (input === "/api/v1/csrf") return Promise.resolve(csrfOkResponse());
      apiCallCount++;
      if (apiCallCount === 1)
        return Promise.resolve(makeFetchResponse(403, { code: "CSRF_INVALID" }));
      return Promise.resolve(apiOkResponse());
    });

    const { result } = renderHook(() => useCsrf());

    await act(async () => { await result.current.csrfFetch("/api/test"); });
    // token is invalidated after the 403 — second call must re-fetch
    await act(async () => { await result.current.csrfFetch("/api/test"); });

    const csrfCalls = fetchMock.mock.calls.filter(([url]: string[]) => url === "/api/v1/csrf");
    expect(csrfCalls).toHaveLength(2);
  });

  it("retries with a fresh token on 401 response", async () => {
    let csrfCallCount = 0;
    let apiCallCount = 0;
    fetchMock.mockImplementation((input: string) => {
      if (input === "/api/v1/csrf") {
        csrfCallCount++;
        return Promise.resolve(csrfOkResponse(csrfCallCount === 1 ? TOKEN : FRESH_TOKEN));
      }
      apiCallCount++;
      return Promise.resolve(makeFetchResponse(apiCallCount === 1 ? 401 : 200, {}));
    });

    const { result } = renderHook(() => useCsrf());
    let response: Awaited<ReturnType<typeof result.current.csrfFetch>> | undefined;
    await act(async () => { response = await result.current.csrfFetch("/api/test"); });

    // Two /api/v1/csrf calls: initial + post-401 refresh
    expect(csrfCallCount).toBe(2);
    // Two /api/test calls: original + retry
    expect(apiCallCount).toBe(2);

    // Retry request carried the fresh token
    const apiCalls = fetchMock.mock.calls.filter(([url]: string[]) => url === "/api/test");
    const retryHeaders: Headers = apiCalls[1][1].headers;
    expect(retryHeaders.get("x-csrf-token")).toBe(FRESH_TOKEN);

    // Final response is the retry's 200
    expect(response!.status).toBe(200);
  });
});
