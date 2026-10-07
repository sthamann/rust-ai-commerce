/** Contextual assistance uses the existing composer and preserves an unsaved editor; opening/seeding never invokes a model. */
import { createRef, useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LocaleProvider, useLocale } from "../../src/shared/i18n/i18n";
import { StudioContext } from "../../src/admin/shell/StudioContext";
import type { StudioController } from "../../src/admin/shell/useStudioController";
import WorkspaceCopilot from "../../src/admin/assistant/WorkspaceCopilot";
function Fixture({ expired = false, busy = false } = {}) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [settings, setSettings] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const send = vi.fn();
  const context = {
    t,
    locale,
    workspaceName: "Live shop",
    environment: "stage",
    environments: [{ id: "stage", name: "Private preview" }],
    tab: "productData",
    tabLabel: () => "Products",
    entityTarget: { id: "lamp" },
    setDraft,
    composer,
    busy,
    draft,
    connected: true,
    sessionExpired: expired,
    send,
    setSettings,
    provider: "custom",
    providers: [{ id: "custom", name: "Inherited platform model" }],
    model: "configured-model",
    messages: [],
    pendingText: "",
    bottom: createRef(),
  } as unknown as StudioController;
  return (
    <StudioContext.Provider value={context}>
      <label>
        Unsaved product name
        <input defaultValue="Original" />
      </label>
      <button onClick={() => setOpen(true)}>Open contextual help</button>
      {settings && <p>Provider settings opened</p>}
      {open && <WorkspaceCopilot onClose={() => setOpen(false)} />}
      <output>{send.mock.calls.length}</output>
    </StudioContext.Provider>
  );
}
it("seeds the correct staging context, keeps edits and restores focus after closing", async () => {
  render(<Fixture />, { wrapper: LocaleProvider });
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Unsaved product name"));
  await user.type(
    screen.getByLabelText("Unsaved product name"),
    "Unpublished name",
  );
  await user.click(
    screen.getByRole("button", { name: "Open contextual help" }),
  );
  expect(
    screen.getByRole("dialog", { name: "Ask Vendune" }),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole("button", { name: /Explain what is happening/ }),
  );
  const input = screen.getByRole("textbox", {
    name: "Message your commerce assistant",
  });
  expect((input as HTMLTextAreaElement).value).toContain(
    "Workspace: Private preview. Area: Products. Selected reference: lamp.",
  );
  await waitFor(() => expect(input).toHaveFocus());
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Unsaved product name")).toHaveValue(
    "Unpublished name",
  );
  await user.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Open contextual help" }),
  ).toHaveFocus();
  expect(screen.getByLabelText("Unsaved product name")).toHaveValue(
    "Unpublished name",
  );
});
it("shows the actual configured provider and closes the modal before opening its settings", async () => {
  render(<Fixture />, { wrapper: LocaleProvider });
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Open contextual help" }),
  );
  await user.click(
    screen.getByRole("button", { name: /Inherited platform model/ }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("Provider settings opened")).toBeInTheDocument();
});
it("disables task seeding while a request is in progress", async () => {
  render(<Fixture busy />, { wrapper: LocaleProvider });
  await userEvent.click(
    screen.getByRole("button", { name: "Open contextual help" }),
  );
  expect(
    screen.getByRole("button", { name: /Prepare a change/ }),
  ).toBeDisabled();
});
it("releases the native modal when the merchant session expires", async () => {
  const { rerender } = render(<Fixture />, { wrapper: LocaleProvider });
  await userEvent.click(
    screen.getByRole("button", { name: "Open contextual help" }),
  );
  rerender(<Fixture expired />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("opens a product through the shared entity route, making the selected reference available to contextual help", async () => {
  const { default: ProductDataView } =
    await import("../../src/admin/catalog/ProductDataView");
  const request = vi.fn(async (path: string) => ({
    elements: path.includes("categories")
      ? []
      : [
          {
            id: "lamp",
            name: "Reading lamp",
            productNumber: "LAMP",
            active: true,
            price: 74.9,
            stock: 40,
          },
        ],
  }));
  const onEntity = vi.fn();
  render(<ProductDataView request={request} onEntity={onEntity} />, {
    wrapper: LocaleProvider,
  });
  await userEvent.click(
    await screen.findByRole("button", { name: /Reading lamp/ }),
  );
  expect(onEntity).toHaveBeenCalledExactlyOnceWith("productData", "lamp");
});
