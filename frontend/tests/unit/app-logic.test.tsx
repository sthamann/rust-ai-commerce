/** Exercise the shared compiler, interpreter and actual native renderer; observe gateway effects instead of schema presence. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { parseBasic, printBasic } from "../../src/admin/developer/basic-code";
import { compile, template } from "../../src/admin/developer/app-model";
import { execute, type LogicHost } from "../../src/shared/apps/native/logic";
import NativeAppView from "../../src/shared/apps/native/NativeAppView";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import type { Statement } from "../../src/shared/apps/native/types";
it("BASIC roundtrips translated branches; arbitrary scripts and incomplete branches fail", () => {
  const source =
    'If qty.Value > 10 Then\nMsgBox {"en":"Too many","de":"Zu viele","es":"Demasiados","fr":"Trop"}\nElse\nValidate editor\nCall save_guides(editor.Record)\nrecords.Refresh\nEnd If';
  const steps = parseBasic(source);
  expect(parseBasic(printBasic(steps))).toEqual(steps);
  expect(() => parseBasic('fetch("https://example.test")')).toThrow();
  expect(() => parseBasic("If qty.Value = 1 Then\nValidate editor")).toThrow();
  expect(() => parseBasic('MsgBox "English only"')).toThrow();
});
it("interpreter validates before saving, applies returned revisions, and rejects coercion or cancellation", async () => {
  const host: LogicHost = {
    value: vi.fn(() => 11),
    record: vi.fn(() => ({ id: "r", revision: 3, fields: { title: "a" } })),
    set: vi.fn(),
    call: vi.fn(async () => ({ id: "r", revision: 4 })),
    accepted: vi.fn(),
    message: vi.fn(),
    navigate: vi.fn(),
    refresh: vi.fn(),
    validate: vi.fn(() => true),
    trace: vi.fn(async () => {}),
  };
  await execute(
    parseBasic(
      'If qty.Value > 10 Then\nMsgBox {"en":"Too many"}\nElse\nCall save_guides(editor.Record)\nEnd If',
    ),
    host,
  );
  expect(host.call).not.toHaveBeenCalled();
  expect(host.message).toHaveBeenCalledWith({ en: "Too many" });
  await execute(
    parseBasic(
      "Validate editor\nCall save_guides(editor.Record)\nrecords.Refresh",
    ),
    host,
  );
  expect(host.accepted).toHaveBeenCalledWith("editor", {
    id: "r",
    revision: 4,
  });
  expect(host.refresh).toHaveBeenCalledWith("records");
  await expect(
    execute(
      [
        {
          op: "if",
          left: { kind: "literal", value: "5" },
          right: { kind: "literal", value: 5 },
          compare: "gt",
          then: [],
        },
      ],
      host,
    ),
  ).rejects.toThrow("APP_LOGIC_TYPE");
  host.validate = () => false;
  await expect(
    execute([{ op: "validate", target: "editor" }], host),
  ).rejects.toThrow("APP_LOGIC_VALIDATION");
  const abort = new AbortController();
  abort.abort();
  await expect(
    execute([{ op: "refresh", target: "records" }], host, abort.signal),
  ).rejects.toThrow("APP_LOGIC_LIMIT");
});
it("a native button saves its form, refreshes its grid, and cannot escape its surface action list", async () => {
  let m = template();
  const steps: Statement[] = [
    { op: "validate", target: "editor" },
    {
      op: "call",
      action: "save_guides",
      input: { kind: "record", block: "editor" },
    },
    { op: "refresh", target: "records" },
  ];
  m.views![0].blocks.push(
    {
      id: "save_button",
      kind: "button",
      title: { en: "Save through app" },
      handlers: { click: steps },
    },
    {
      id: "bad_button",
      kind: "button",
      title: { en: "Forbidden action" },
      handlers: {
        click: [
          {
            op: "call",
            action: "private_action",
            input: { kind: "literal", value: {} },
          },
        ],
      },
    },
  );
  m = compile(m);
  let rows: any[] = [];
  const request = vi.fn(async (path: string, input?: any) => {
    if (path.endsWith("list_guides")) return { elements: rows };
    if (path.endsWith("save_guides")) {
      rows = [{ id: input.id, revision: 1, ...input.fields }];
      return rows[0];
    }
    throw Error("Unexpected action");
  });
  render(
    <NativeAppView
      app={m.id}
      native={{ view: m.views![0], entities: m.entities }}
      request={request}
      allowedActions={["list_guides", "save_guides"]}
    />,
    { wrapper: LocaleProvider },
  );
  const user = userEvent.setup();
  await screen.findByLabelText("Title");
  await user.type(screen.getByLabelText("Title"), "Real record");
  await user.click(screen.getByRole("button", { name: "Save through app" }));
  await waitFor(() =>
    expect(request.mock.calls.some(([p]) => p.endsWith("save_guides"))).toBe(
      true,
    ),
  );
  await waitFor(() =>
    expect(screen.getAllByText("Real record").length).toBeGreaterThan(0),
  );
  const count = request.mock.calls.length;
  await user.click(screen.getByRole("button", { name: "Forbidden action" }));
  await screen.findByRole("alert");
  expect(request.mock.calls.length).toBe(count);
});
