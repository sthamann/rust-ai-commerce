/** Real transport construction: tenant/staging isolation, JSON/uploads and localized failures. */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  createStudioRequest,
  useStudioRequests,
} from "../../src/admin/shell/requests";
import { useServerHealth } from "../../src/admin/shell/useServerHealth";
import { useStudioNavigation } from "../../src/admin/shell/navigation";
import { LocaleProvider, locales, useLocale } from "../../src/shared/i18n/i18n";
import { useStudio } from "../../src/admin/shell/StudioContext";
import { useStorefront } from "../../src/storefront/shell/StorefrontContext";
describe("Studio transport", () => {
  it("preserves tenant, principal, locale and explicit method", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ revision: 7 }) });
    vi.stubGlobal("fetch", fetcher);
    const api = createStudioRequest("token-fixture", "tenant-a", "de-DE");
    expect(await api("/api/items")).toEqual({ revision: 7 });
    await api("/api/items", { revision: 6 });
    await api("/api/items", null, "DELETE");
    expect(fetcher.mock.calls.map((c) => c[1].method)).toEqual([
      "GET",
      "POST",
      "DELETE",
    ]);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      headers: {
        Authorization: "Bearer token-fixture",
        "x-tenant": "tenant-a",
        "x-commerce-locale": "de-DE",
      },
      body: undefined,
    });
    expect(fetcher.mock.calls[1][1].body).toBe('{"revision":6}');
  });
  it("lets the browser set multipart boundaries", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetcher);
    const form = new FormData();
    form.append("file", new Blob(["test"]), "datasheet.txt");
    await createStudioRequest("t", "a", "en-GB")("/api/upload", form);
    expect(fetcher.mock.calls[0][1].body).toBe(form);
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("Content-Type");
  });
  it.each([{ errors: [{ detail: "Invalid credentials" }] }, {}])(
    "rejects responses with localized diagnostic %#",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: async () => body,
        }),
      );
      await expect(
        createStudioRequest("t", "a", "en-GB")("/api/items"),
      ).rejects.toMatchObject({
        status: 401,
        diagnostic: body.errors?.[0]?.detail ?? "Unauthorized",
      });
    },
  );
  it("keeps live operations live and scopes staging operations", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetcher);
    const { result, rerender } = renderHook(
      ({ stage }) => useStudioRequests("t", "live", stage, "en-GB"),
      { initialProps: { stage: "" } },
    );
    expect(result.current.request).toBe(result.current.liveRequest);
    rerender({ stage: "stage" });
    await result.current.request("/api/items");
    await result.current.liveRequest("/api/items");
    expect(fetcher.mock.calls.map((c) => c[1].headers["x-tenant"])).toEqual([
      "stage",
      "live",
    ]);
  });
  it("tracks public health, retries and releases its interval", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetcher);
    const { result, unmount } = renderHook(useServerHealth);
    await act(async () => {});
    expect(result.current).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(result.current).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(result.current).toBe(false);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ignores a late health reply after unmount", async () => {
    let reply!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            reply = resolve;
          }),
      ),
    );
    const { unmount } = renderHook(useServerHealth);
    unmount();
    await act(async () => reply({ ok: true }));
  });
  it("ignores a late failed health reply after unmount", async () => {
    let reject!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((_, r) => {
            reject = r;
          }),
      ),
    );
    const { unmount } = renderHook(useServerHealth);
    unmount();
    await act(async () => reject(new Error("offline")));
  });
  it("labels every built-in tab in all four languages", async () => {
    const { result } = renderHook(
      () => ({ ...useStudioNavigation(), ...useLocale() }),
      { wrapper: LocaleProvider },
    );
    for (const locale of Object.keys(locales) as (keyof typeof locales)[]) {
      act(() => result.current.setLocale(locale));
      await waitFor(() => expect(result.current.locale).toBe(locale));
      for (const tab of result.current.nav)
        expect(result.current.tabLabel(tab.id).trim()).not.toBe("");
    }
  });
  it.each([useStudio, useStorefront])(
    "rejects views outside their scoped controller",
    (hook) => {
      expect(() => renderHook(hook as () => unknown)).toThrow(
        /requires .*Context/,
      );
    },
  );
});
