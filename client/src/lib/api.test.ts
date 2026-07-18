import { describe, it, expect, vi, afterEach } from "vitest";
import { apiFetch, ApiError } from "./api";

describe("apiFetch — abort handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-throws an AbortError unchanged instead of wrapping it into a network ApiError", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(abortError)
    );

    await expect(apiFetch("/eval-cases/1/run")).rejects.toBe(abortError);

    try {
      await apiFetch("/eval-cases/1/run");
      throw new Error("expected apiFetch to reject");
    } catch (e) {
      expect(e).not.toBeInstanceOf(ApiError);
      if (e instanceof ApiError) {
        expect(e.code).not.toBe("network_error");
      }
    }
  });

  it("still wraps a genuine network failure into a network ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    await expect(apiFetch("/eval-cases/1/run")).rejects.toMatchObject({
      code: "network_error",
      status: 0,
    });
  });
});
