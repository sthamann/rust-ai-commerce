/** Actor-private draft restoration, bounded geometry and pinned iframe transport exercise the real host components. */
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { template } from "../../src/admin/developer/app-model";
import { useDraftStorage } from "../../src/admin/developer/useDraftStorage";
import { geometry, snap } from "../../src/shared/apps/native/geometry";
import AppFrame from "../../src/shared/apps/AppFrame";
import AppGridCanvas from "../../src/admin/developer/AppGridCanvas";
import NativeAppView from "../../src/shared/apps/native/NativeAppView";
afterEach(() => vi.useRealTimers());
it("restores the latest actor draft before edits and persists later edits with its actual revision", async () => {
  vi.useFakeTimers();
  const manifest = template(),
    restore = vi.fn();
  const request = vi.fn(async (path: string, body?: any) =>
    path.endsWith("drafts")
      ? {
          drafts: [
            { id: manifest.id, manifest, environment: "sandbox", revision: 9 },
          ],
        }
      : { revision: body.revision + 1 },
  );
  const { result, rerender } = renderHook(
    ({ m, edited }) => useDraftStorage(request, m, "sandbox", edited, restore),
    { initialProps: { m: manifest, edited: false } },
  );
  await act(async () => {});
  expect(restore).toHaveBeenCalledWith(manifest, "sandbox");
  expect(result.current.restored).toBe(true);
  const next = { ...manifest, name: { en: "Changed" } };
  rerender({ m: next, edited: true });
  expect(result.current.pending).toBe(true);
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(501);
  });
  expect(request).toHaveBeenLastCalledWith(
    `/api/developer/drafts/${manifest.id}`,
    { manifest: next, environment: "sandbox", revision: 9 },
    "PUT",
  );
  expect(result.current.pending).toBe(false);
});
it("keeps the unload warning and visible error after an optimistic draft conflict", async () => {
  vi.useFakeTimers();
  const request = vi.fn(async (path: string) => {
    if (path.endsWith("drafts")) return { drafts: [] };
    throw Error("Revision changed");
  });
  const manifest = template(),
    restore = vi.fn();
  const { result } = renderHook(() =>
    useDraftStorage(request, manifest, "sandbox", true, restore),
  );
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(501);
  });
  expect(result.current.pending).toBe(true);
  expect(result.current.error).toBe("Revision changed");
});
it("pins UI loading to the scoped host request and removes forms, popups and direct URL navigation", async () => {
  const request = vi.fn(async () => ({ html: "<h1>Fixture</h1>" }));
  render(
    <AppFrame
      app="example"
      url="https://external.invalid/ui"
      request={request}
      allowedActions={["list_records"]}
    />,
    { wrapper: LocaleProvider },
  );
  const frame = await screen.findByTitle("example");
  expect(request).toHaveBeenCalledWith("__bundle", {});
  expect(frame).not.toHaveAttribute("src");
  expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  expect(frame.getAttribute("srcdoc")).toContain("connect-src 'none'");
  expect(frame.getAttribute("srcdoc")).toContain("form-action 'none'");
});
it("a rejected bundle stays outside the iframe and offers a retry", async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(Error("Changed digest"))
    .mockResolvedValue({ html: "<p>Approved</p>" });
  render(
    <AppFrame
      app="example"
      url="https://external.invalid/ui"
      request={request}
      allowedActions={[]}
    />,
    { wrapper: LocaleProvider },
  );
  await screen.findByRole("alert");
  expect(screen.queryByTitle("example")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
  await screen.findByTitle("example");
  expect(request).toHaveBeenCalledTimes(2);
});
it("snap clamps pathological and non-finite values and keeps the implicit block row", () => {
  expect(snap({ x: 200, y: 500, w: 4, h: 0 })).toEqual({
    x: 8,
    y: 200,
    w: 4,
    h: 1,
  });
  expect(snap({ x: NaN, y: Infinity, w: NaN, h: -1 })).toEqual({
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  });
  expect(geometry(template().views![0].blocks[0], 2).y).toBe(12);
});
it("the raster supports keyboard selection and bounded palette drop without creating another runtime", () => {
  const view = { ...template().views![0], layout: "form" as const };
  const select = vi.fn(),
    add = vi.fn();
  const { container } = render(
    <AppGridCanvas
      onCode={vi.fn()}
      view={view}
      selected=""
      onSelect={select}
      onAdd={add}
      onChange={vi.fn()}
      mainLocale="en-GB"
    />,
    { wrapper: LocaleProvider },
  );
  fireEvent.keyDown(container.querySelector("article")!, { key: "Enter" });
  expect(select).toHaveBeenCalledWith(view.blocks[0].id);
  fireEvent.drop(container.querySelector(".app-form-canvas")!, {
    clientX: 5,
    clientY: 5,
    dataTransfer: {
      getData: (type: string) => (type.endsWith("kind") ? "text" : ""),
    },
  });
  expect(add).toHaveBeenCalledOnce();
});
it("hidden blocks are not read and disabled forms cannot save through ordinary controls", async () => {
  const m = template(),
    view = { ...m.views![0], layout: "form" as const };
  view.blocks = view.blocks.map((b) =>
    b.kind === "form" ? { ...b, enabled: false } : { ...b, visible: false },
  );
  const request = vi.fn(async () => ({ elements: [] }));
  render(
    <NativeAppView
      app={m.id}
      native={{ view, entities: m.entities }}
      request={request}
      allowedActions={["list_guides", "save_guides"]}
    />,
    { wrapper: LocaleProvider },
  );
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "Save record" })).toBeDisabled();
});
