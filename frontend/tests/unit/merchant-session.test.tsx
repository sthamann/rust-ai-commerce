/** Session rejection controls cover unrelated credentials, stale replies, visible heartbeats and cleanup. */
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useStudioSession } from "../../src/admin/shell/useStudioSession";
import { requestJson } from "../../src/shared/api/request-json";
import { onMerchantSessionFailure } from "../../src/shared/api/merchant-session";

const detail = "Session or integration key expired or invalid";
function response(status = 401, diagnostic = detail) {
  return {
    ok: status === 200,
    status,
    json: async () => ({ errors: [{ detail: diagnostic }] }),
  };
}

it.each([
  ["/api/merchant/products", 403, detail, "Bearer active"],
  ["/api/merchant/products", 500, detail, "Bearer active"],
  ["/store-api/account/customer", 401, detail, "Bearer active"],
  ["/api/platform/session", 401, detail, "Bearer active"],
  ["/api/auth/login", 401, detail, "Bearer active"],
  ["/api/auth/register", 401, detail, "Bearer active"],
  ["/api/auth/accept", 401, detail, "Bearer active"],
  [
    "/api/apps/payment/actions",
    401,
    "Provider credentials expired",
    "Bearer active",
  ],
  ["/api/merchant/products", 401, detail, "Basic active"],
  ["/api/merchant/products", 401, detail, "Bearer "],
  ["/api/merchant/products", 401, detail, ""],
])(
  "does not expire Studio for unrelated failure %#",
  async (path, status, diagnostic, authorization) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response(status as number, diagnostic as string)),
    );
    const invalid = vi.fn();
    const { unmount } = renderHook(() =>
      useStudioSession("active", true, vi.fn(), invalid),
    );
    await act(() =>
      requestJson(path as string, {
        headers: { Authorization: authorization as string },
      }),
    );
    expect(invalid).not.toHaveBeenCalled();
    unmount();
  },
);

it("ignores a rejected old credential after a new login and unsubscribes on unmount", async () => {
  let rejectOld!: (value: ReturnType<typeof response>) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          rejectOld = resolve;
        }),
    ),
  );
  const invalid = vi.fn();
  const live = vi.fn();
  const { rerender, unmount } = renderHook(
    ({ token }) => useStudioSession(token, true, live, invalid),
    { initialProps: { token: "old" } },
  );
  const old = requestJson("/api/merchant/products", {
    headers: { Authorization: "Bearer old" },
  });
  rerender({ token: "new" });
  await act(async () => {
    rejectOld(response());
    await old;
  });
  expect(invalid).not.toHaveBeenCalled();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  await act(() =>
    requestJson("/api/merchant/products", {
      headers: { Authorization: "Bearer new" },
    }),
  );
  expect(invalid).toHaveBeenCalledExactlyOnceWith(detail);
  invalid.mockClear();
  unmount();
  await requestJson("/api/merchant/products", {
    headers: { Authorization: "Bearer new" },
  });
  expect(invalid).not.toHaveBeenCalled();
});

it("revalidates visible sessions once per minute without overlapping calls and releases timers", async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  const live = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const invalid = vi.fn();
  const { unmount } = renderHook(() =>
    useStudioSession("active", true, live, invalid),
  );
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(live).toHaveBeenCalledExactlyOnceWith("/api/auth/session");
  await act(async () => window.dispatchEvent(new Event("focus")));
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(live).toHaveBeenCalledTimes(1);
  await act(async () => finish({}));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(live).toHaveBeenCalledTimes(1);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(live).toHaveBeenCalledTimes(2);
  await act(async () => finish({}));
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  window.dispatchEvent(new Event("focus"));
  expect(live).toHaveBeenCalledTimes(2);
  expect(invalid).not.toHaveBeenCalled();
});

it("does not schedule authenticated requests while signed out or disconnected", () => {
  vi.useFakeTimers();
  const live = vi.fn();
  const { rerender, unmount } = renderHook(
    ({ token }) => useStudioSession(token, false, live, vi.fn()),
    { initialProps: { token: "" } },
  );
  window.dispatchEvent(new Event("focus"));
  rerender({ token: "active" });
  window.dispatchEvent(new Event("focus"));
  expect(live).not.toHaveBeenCalled();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("isolates duplicate readers while reporting one rejection from their actual shared response", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  const fetcher = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const listener = vi.fn();
  const unsubscribe = onMerchantSessionFailure(listener);
  try {
    const init = { headers: { Authorization: "Bearer active" } };
    const a = requestJson("/api/merchant/products", init);
    const b = requestJson("/api/merchant/products", init);
    finish(response());
    const values = await Promise.all([a, b]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledExactlyOnceWith({
      token: "active",
      detail,
    });
    expect(values[0]).not.toBe(values[1]);
  } finally {
    unsubscribe();
  }
});
