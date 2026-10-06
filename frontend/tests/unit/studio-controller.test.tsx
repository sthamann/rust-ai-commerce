/** Controller regressions exercise real state transitions, failures and environment routing. */
import { act, renderHook, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { useStudioController } from "../../src/admin/shell/useStudioController";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { overview, providers, session } from "./fixtures";
import type { Message } from "../../src/admin/shell/studio-types";
import { shopApi } from "../../src/shared/api/shop-api";
function network() {
  const messages: Message[] = [
    {
      id: 1,
      role: "assistant",
      content: "Fixture answer",
      applied: false,
      data: { taskId: "unit-task" },
    },
  ];
  const fetcher = vi.fn(
    async (path: RequestInfo | URL, options?: RequestInit) => {
      const p = String(path);
      let value: unknown;
      if (p === "/health") return { ok: true };
      if (p === "/api/auth/access")
        value = { permissions: ["orders.read", "catalog.write"] };
      else if (p === "/api/environments")
        value = { environments: [{ id: "stage", name: "Stage" }] };
      else if (p === "/api/agent/providers") value = providers;
      else if (p === "/api/merchant/overview") value = overview;
      else if (p === "/api/agent/conversations")
        value = { conversations: [{ id: "c", title: "Fixture conversation" }] };
      else if (p === "/api/auth/session") value = session;
      else if (p === "/api/agent/conversations/c" || p === "/api/agent/chat")
        value = { conversationId: "c", messages };
      else if (p === "/api/agent/tasks/unit-task/apply")
        value = { applied: true };
      else throw Error("Unexpected fixture path " + p + " " + options?.method);
      return { ok: true, json: async () => value };
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, messages };
}
it("does not authenticate a signed-out user merely because the server is healthy", async () => {
  network();
  const { result } = renderHook(
    () => useStudioController({ onChanged: vi.fn(), onExit: vi.fn() }),
    { wrapper: LocaleProvider },
  );
  await waitFor(() => expect(result.current.serverReady).toBe(true));
  expect(result.current.connected).toBe(false);
  act(() => result.current.setDraft("hello"));
  await act(() => result.current.send());
  expect(result.current.messages).toEqual([]);
});
it("loads a scoped session, preserves staging headers, sends and applies a plan", async () => {
  sessionStorage.setItem("rac-user-token", "unit-token");
  const { fetcher, messages } = network();
  const changed = vi.fn();
  const { result } = renderHook(
    () => useStudioController({ onChanged: changed, onExit: vi.fn() }),
    { wrapper: LocaleProvider },
  );
  await waitFor(() => expect(result.current.connected).toBe(true));
  expect(result.current.workspaceName).toBe("Unit shop");
  expect(result.current.role).toBe("owner");
  act(() => result.current.intent("Question"));
  expect(result.current.draft).toBe("Question");
  await act(() => result.current.send());
  expect(result.current.messages).toEqual(messages);
  expect(result.current.pendingText).toBe("");
  expect(result.current.id).toBe("c");
  await act(() => result.current.apply(messages[0]));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(result.current.notice?.key).toBe("approvedAction");
  act(() => result.current.newChat());
  expect(result.current.messages).toEqual([]);
  expect(result.current.id).toBeUndefined();
  act(() => result.current.setEnvironment("stage"));
  await waitFor(() => expect(result.current.connected).toBe(true));
  await act(() => result.current.request("/api/merchant/overview"));
  const call = fetcher.mock.calls.at(-1)!;
  expect(call[1]?.headers).toMatchObject({
    "x-tenant": "stage",
    Authorization: "Bearer unit-token",
  });
  await act(() => result.current.refreshEnvironments());
  expect(result.current.environments[0].id).toBe("stage");
  act(() => result.current.setTheme("dark"));
  expect(localStorage.getItem("rac-studio-theme-v03")).toBe("dark");
});
it("restores a failed chat draft and clears the pending indicator", async () => {
  sessionStorage.setItem("rac-user-token", "unit-token");
  const { fetcher } = network();
  const { result } = renderHook(
    () => useStudioController({ onChanged: vi.fn(), onExit: vi.fn() }),
    { wrapper: LocaleProvider },
  );
  await waitFor(() => expect(result.current.connected).toBe(true));
  fetcher.mockImplementationOnce(async () => {
    throw Error("Offline");
  });
  act(() => result.current.setDraft("Keep this"));
  await act(() => result.current.send());
  expect(result.current.draft).toBe("Keep this");
  expect(result.current.busy).toBe(false);
  expect(result.current.error).toBe("Offline");
  expect(result.current.pendingText).toBe("");
  await act(() =>
    result.current.run(async () => {
      throw "String failure";
    }),
  );
  expect(result.current.error).toBe("String failure");
});
it("does not install a late session after unmount", async () => {
  sessionStorage.setItem("rac-user-token", "unit-token");
  const pending: ((v: unknown) => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise((resolve) => pending.push(resolve))),
  );
  const { unmount } = renderHook(
    () => useStudioController({ onChanged: vi.fn(), onExit: vi.fn() }),
    { wrapper: LocaleProvider },
  );
  unmount();
  await act(async () =>
    pending.forEach((resolve) => resolve({ ok: true, json: async () => ({}) })),
  );
});
it("keeps an authenticated editor mounted while changing UI language and disconnects if revalidation fails", async () => {
  sessionStorage.setItem("rac-user-token", "unit-token");
  const { fetcher } = network();
  const { result } = renderHook(
    () => useStudioController({ onChanged: vi.fn(), onExit: vi.fn() }),
    { wrapper: LocaleProvider },
  );
  await waitFor(() => expect(result.current.connected).toBe(true));
  const original = fetcher.getMockImplementation()!;
  let reject!: (error: Error) => void;
  fetcher.mockImplementation((path, options) =>
    String(path) === "/api/auth/session"
      ? new Promise((_resolve, fail) => {
          reject = fail;
        })
      : original(path, options),
  );
  act(() => result.current.setLocale("de-DE"));
  await waitFor(() => expect(reject).toBeDefined());
  expect(result.current.connected).toBe(true);
  await act(async () => reject(new Error("Session expired")));
  expect(result.current.connected).toBe(false);
  expect(result.current.data).toBeUndefined();
});

it("expires the whole Studio when a product request rejects the current session", async () => {
  sessionStorage.setItem("rac-user-token", "unit-token");
  const { fetcher, messages } = network();
  const { result } = renderHook(
    () => useStudioController({ onChanged: vi.fn(), onExit: vi.fn() }),
    { wrapper: LocaleProvider },
  );
  await waitFor(() => expect(result.current.connected).toBe(true));
  act(() => result.current.setMessages(messages));
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((path, options) =>
    String(path).startsWith("/api/merchant/products")
      ? Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({
            errors: [
              { detail: "Session or integration key expired or invalid" },
            ],
          }),
        })
      : original(path, options),
  );
  await act(async () => {
    await expect(
      result.current.request("/api/merchant/products?limit=25"),
    ).rejects.toMatchObject({ status: 401 });
  });
  expect(result.current.connected).toBe(false);
  expect(result.current.token).toBe("");
  expect(sessionStorage.getItem("rac-user-token")).toBeNull();
  expect(result.current.data).toBeUndefined();
  expect(result.current.access).toEqual([]);
  expect(result.current.conversations).toEqual([]);
  expect(result.current.messages).toEqual([]);
  expect(result.current.updated).toBe("");
  expect(result.current.error).toBe("Please sign in again.");
  sessionStorage.setItem("rac-user-token", "renewed-token");
  act(() => result.current.setToken("renewed-token"));
  await waitFor(() => expect(result.current.connected).toBe(true));
  expect(result.current.data).toEqual(overview);
});

it("also expires shared merchant requests and revalidates on returning to Studio", async () => {
  sessionStorage.setItem("rac-user-token", "unit-token");
  const { fetcher } = network();
  const { result } = renderHook(
    () => useStudioController({ onChanged: vi.fn(), onExit: vi.fn() }),
    { wrapper: LocaleProvider },
  );
  await waitFor(() => expect(result.current.connected).toBe(true));
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((path, options) =>
    String(path) === "/api/auth/session"
      ? Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({
            errors: [
              { detail: "Session or integration key expired or invalid" },
            ],
          }),
        })
      : original(path, options),
  );
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(result.current.connected).toBe(false));
  expect(result.current.data).toBeUndefined();
  fetcher.mockImplementation(original);
  sessionStorage.setItem("rac-user-token", "renewed-token");
  act(() => result.current.setToken("renewed-token"));
  await waitFor(() => expect(result.current.connected).toBe(true));
  fetcher.mockImplementationOnce(async () => ({
    ok: false,
    status: 401,
    json: async () => ({
      errors: [{ detail: "Session or integration key expired or invalid" }],
    }),
  }));
  await act(async () => {
    await expect(
      shopApi(
        "/api/workspace/members",
        undefined,
        undefined,
        undefined,
        "renewed-token",
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  expect(result.current.connected).toBe(false);
});

it.each([
  ["developers", "developers"],
  ["unknown", "assistant"],
])(
  "opens only a known Studio workspace from the %s deep link",
  async (target, expected) => {
    history.replaceState(
      null,
      "",
      `/?shop=unit-shop&studio=${target}#merchant`,
    );
    network();
    const { result } = renderHook(
      () => useStudioController({ onChanged: vi.fn(), onExit: vi.fn() }),
      { wrapper: LocaleProvider },
    );
    expect(result.current.tab).toBe(expected);
    await waitFor(() => expect(result.current.serverReady).toBe(true));
  },
);
