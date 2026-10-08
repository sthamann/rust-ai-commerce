/** Real designer edits, BASIC completions, debug suspension and export downloads verify visible user actions. */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { template } from "../../src/admin/developer/app-model";
import AppGridCanvas from "../../src/admin/developer/AppGridCanvas";
import AppLogicEditor from "../../src/admin/developer/AppLogicEditor";
import AppModelDiagram from "../../src/admin/developer/AppModelDiagram";
import AppMenuEditor from "../../src/admin/developer/AppMenuEditor";
import AppJobArtifact from "../../src/admin/apps/AppJobArtifact";
import NativeAppView from "../../src/shared/apps/native/NativeAppView";

it("multi-select alignment and tab mode edit manifest geometry; Classic changes only the designer", () => {
  const view = { ...template().views![0], layout: "form" as const };
  view.blocks[0].geometry = { x: 3, y: 5, w: 4, h: 2 };
  view.blocks[1].geometry = { x: 1, y: 8, w: 4, h: 2 };
  const change = vi.fn(),
    select = vi.fn();
  function Canvas() {
    const [selected, setSelected] = useState("");
    return (
      <AppGridCanvas
        view={view}
        selected={selected}
        onSelect={(id) => {
          select(id);
          setSelected(id);
        }}
        onChange={change}
        onAdd={vi.fn()}
        onCode={vi.fn()}
        mainLocale="en-GB"
      />
    );
  }
  const { container } = render(<Canvas />, { wrapper: LocaleProvider });
  const controls = container.querySelectorAll("article");
  fireEvent.click(controls[0]);
  fireEvent.click(controls[1], { ctrlKey: true });
  fireEvent.click(screen.getByRole("button", { name: "Align left" }));
  const aligned = change.mock.calls.at(-1)![0];
  expect(aligned[0].geometry.x).toBe(1);
  expect(aligned[1].geometry.x).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Tab order" }));
  fireEvent.click(controls[1]);
  expect(change.mock.calls.at(-1)![0][1].tabOrder).toBe(1);
  fireEvent.click(screen.getByLabelText("Classic designer"));
  expect(container.querySelector(".app-form-canvas")).toHaveClass(
    "classic-designer",
  );
});

it("BASIC action and refresh completions compile into the same editable AST", () => {
  const m = template(),
    view = m.views![0],
    change = vi.fn();
  render(
    <AppLogicEditor
      block={{ id: "save_button", kind: "button", title: { en: "Save" } }}
      manifest={m}
      view={view}
      onChange={change}
      onClose={vi.fn()}
    />,
    { wrapper: LocaleProvider },
  );
  fireEvent.click(screen.getByRole("button", { name: "BASIC" }));
  fireEvent.click(screen.getByRole("button", { name: "save_guides" }));
  fireEvent.click(screen.getByRole("button", { name: /Refresh.*records/ }));
  fireEvent.click(screen.getByRole("button", { name: "Apply code" }));
  expect(change).toHaveBeenCalledWith(
    expect.objectContaining({
      handlers: {
        click: [
          {
            op: "call",
            action: "save_guides",
            input: { kind: "record", block: "editor" },
          },
          { op: "refresh", target: "records" },
        ],
      },
    }),
  );
});

it("the model wizard adds real form/actions/surface; custom menu paths survive editing", () => {
  const m = template(),
    change = vi.fn();
  const { unmount } = render(
    <AppModelDiagram manifest={m} onChange={change} />,
    { wrapper: LocaleProvider },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Create workspace from model" }),
  );
  const next = change.mock.calls[0][0];
  expect(next.views.length).toBeGreaterThan(m.views!.length);
  expect(next.actions.some((a: any) => a.name.startsWith("save_"))).toBe(true);
  unmount();
  m.surfaces = [
    {
      id: "external",
      location: "admin.navigation",
      label: { en: "External" },
      uiPath: "v1/index.html",
      actions: [],
    },
  ];
  render(<AppMenuEditor manifest={m} onChange={change} />, {
    wrapper: LocaleProvider,
  });
  expect(
    screen.getByRole("option", { name: "v1/index.html" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("save_guides"));
  expect(change.mock.calls.at(-1)![0].surfaces[0]).toMatchObject({
    uiPath: "v1/index.html",
    actions: ["save_guides"],
  });
});

it("a debug breakpoint stops before the gateway call, then Continue resumes its real action", async () => {
  const m = template();
  m.views![0].blocks = [
    {
      id: "go",
      kind: "button",
      title: { en: "Run callback" },
      handlers: {
        click: [
          {
            op: "call",
            action: "save_guides",
            input: { kind: "literal", value: {} },
          },
        ],
      },
    },
  ];
  const request = vi.fn(async () => ({ revision: 1 }));
  render(
    <NativeAppView
      app={m.id}
      native={{ view: m.views![0], entities: m.entities }}
      request={request}
      allowedActions={["save_guides"]}
      debug
    />,
    { wrapper: LocaleProvider },
  );
  fireEvent.change(screen.getByLabelText("Break at step"), {
    target: { value: "1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run callback" }));
  const resume = await screen.findByRole("button", {
    name: "Next instruction",
  });
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(resume);
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      `/api/apps/${m.id}/actions/save_guides`,
      {},
    ),
  );
});

it("finished export reads private bytes only on click and revokes its temporary download URL", async () => {
  const create = vi.fn(() => "blob:fixture"),
    revoke = vi.fn(),
    click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }),
  );
  const request = vi.fn(async () => ({
    base64: btoa("id,sku\nmug,TEST"),
    filename: "catalog.csv.txt",
  }));
  render(
    <AppJobArtifact
      app="catalog_export"
      result={{ assetId: "private-file" }}
      request={request}
    />,
    { wrapper: LocaleProvider },
  );
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Download/ }));
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  expect(request).toHaveBeenCalledWith("/api/apps/catalog_export/core/asset", {
    id: "private-file",
  });
  expect(create).toHaveBeenCalledOnce();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1050));
  });
  expect(revoke).toHaveBeenCalledWith("blob:fixture");
  click.mockRestore();
  vi.unstubAllGlobals();
});
