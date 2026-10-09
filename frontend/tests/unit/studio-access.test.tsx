/** Protected deep links and in-place reauthentication preserve drafts and reject another identity. */
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useStudioController } from "../../src/admin/shell/useStudioController";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { session, overview, providers } from "./fixtures";
import { reportMerchantSessionFailure } from "../../src/shared/api/merchant-session";
import PersonalAccountForm from "../../src/admin/team/PersonalAccountForm";

it("enforces shop slugs with modern HTML Unicode-set pattern validation", () => {
  render(
    <PersonalAccountForm
      run={vi.fn()}
      mode="register"
      onSession={vi.fn()}
      s={(key) => key}
      busy={false}
    />,
  );
  const input = screen.getByLabelText("workspaceId") as HTMLInputElement;
  const pattern = new RegExp(`^(?:${input.pattern})$`, "v");
  for (const value of ["ab", "release-browser-shop", "shop2026"])
    expect(pattern.test(value)).toBe(true);
  for (const value of ["-shop", "Shop", "my_shop", "shop name", "shop/other"])
    expect(pattern.test(value)).toBe(false);
});
function network() {
  const fetcher = vi.fn(async (path: RequestInfo | URL) => ({
    ok: true,
    status: 200,
    json: async () =>
      String(path) === "/api/auth/session"
        ? session
        : String(path) === "/api/merchant/overview"
          ? overview
          : String(path) === "/api/agent/providers"
            ? providers
            : { permissions: [], environments: [], conversations: [] },
  }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function controller() {
  return renderHook(
    () => useStudioController({ onChanged: vi.fn(), onExit: vi.fn() }),
    { wrapper: LocaleProvider },
  );
}
it("redirects anonymous deep links to login without requesting protected workspaces", async () => {
  history.replaceState(
    null,
    "",
    "/?shop=unit-shop&studio=productData&entity=lamp#merchant",
  );
  const fetcher = network();
  const { result } = controller();
  await waitFor(() => expect(location.hash).toBe("#login"));
  expect(result.current.auth.identity).toBeUndefined();
  expect(result.current.tab).toBe("productData");
  expect(new URLSearchParams(location.search).get("entity")).toBe("lamp");
  expect(fetcher.mock.calls.every(([p]) => String(p) === "/health")).toBe(true);
});
it("keeps the entity, draft and transport stable through same-user reauthentication", async () => {
  sessionStorage.setItem("rac-user-token", "access-test-token");
  network();
  const { result } = controller();
  await waitFor(() => expect(result.current.connected).toBe(true));
  act(() => {
    result.current.openEntity("productData", "lamp");
    result.current.setDraft("Unsaved text");
  });
  const before = result.current.request;
  act(() =>
    reportMerchantSessionFailure(
      "/api/merchant/products",
      { Authorization: "Bearer access-test-token" },
      401,
      "Session or integration key expired or invalid",
    ),
  );
  expect(result.current.sessionExpired).toBe(true);
  expect(result.current.connected).toBe(true);
  expect(result.current.data).toEqual(overview);
  expect(result.current.entityTarget?.id).toBe("lamp");
  expect(sessionStorage.getItem("rac-user-token")).toBeNull();
  await act(() =>
    result.current.auth.accept({ ...session, token: "access-renewed" }),
  );
  await waitFor(() => expect(result.current.sessionExpired).toBe(false));
  expect(result.current.request).toBe(before);
  expect(result.current.entityTarget?.id).toBe("lamp");
  expect(result.current.draft).toBe("Unsaved text");
  expect(location.hash).toBe("#merchant");
});
it("does not resume a private editor with a different account or missing shop membership", async () => {
  sessionStorage.setItem("rac-user-token", "access-test-other");
  network();
  const { result } = controller();
  await waitFor(() => expect(result.current.connected).toBe(true));
  await expect(
    result.current.auth.accept({
      ...session,
      token: "foreign",
      user: { ...session.user, id: "another" },
    }),
  ).rejects.toThrow();
  await expect(
    result.current.auth.accept({
      ...session,
      token: "foreign",
      workspaces: [],
    }),
  ).rejects.toThrow();
  expect(result.current.token).toBe("access-test-other");
});

it("rejects an expired stored token before loading any protected data", async () => {
  sessionStorage.setItem("rac-user-token", "access-initial-expired");
  const fetcher = vi.fn(async (p: RequestInfo | URL) =>
    String(p) === "/health"
      ? { ok: true }
      : {
          ok: false,
          status: 401,
          json: async () => ({
            errors: [
              { detail: "Session or integration key expired or invalid" },
            ],
          }),
        },
  );
  vi.stubGlobal("fetch", fetcher);
  const { result } = controller();
  await waitFor(() => expect(location.hash).toBe("#login"));
  expect(result.current.auth.identity).toBeUndefined();
  expect(result.current.sessionExpired).toBe(false);
  expect(
    fetcher.mock.calls.every(([p]) =>
      ["/health", "/api/auth/session"].includes(String(p)),
    ),
  ).toBe(true);
});
it("pauses later writes and resumes with fresh credentials without replaying the failed operation", async () => {
  sessionStorage.setItem("rac-user-token", "access-paused");
  const fetcher = network();
  const { result } = controller();
  await waitFor(() => expect(result.current.connected).toBe(true));
  act(() =>
    reportMerchantSessionFailure(
      "/api/merchant/products",
      { Authorization: "Bearer access-paused" },
      401,
      "Session or integration key expired or invalid",
    ),
  );
  const count = fetcher.mock.calls.length;
  await expect(
    result.current.request("/api/merchant/products/lamp", { price: 42 }, "PUT"),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher.mock.calls.length).toBe(count);
  await act(() =>
    result.current.auth.accept({ ...session, token: "access-write-renewed" }),
  );
  expect(
    fetcher.mock.calls.filter(([p]) => String(p).endsWith("products/lamp")),
  ).toHaveLength(0);
});
