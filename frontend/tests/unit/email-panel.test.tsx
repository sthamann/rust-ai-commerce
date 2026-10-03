/** Real email UI interactions; fixtures accept actions locally and cannot send a message. */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import EmailPanel from "../../src/admin/apps/EmailPanel";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { mailStatus, mailSettings } from "./fixtures";
function setup(manage = true) {
  let status = mailStatus();
  const request = vi.fn(
    async (path: string, body?: unknown, _method?: string) => {
      const input = body as Record<string, any>;
      if (path.endsWith("/status")) return status;
      if (path.endsWith("/configure")) {
        status = {
          ...status,
          revision: status.revision + 1,
          settings: input.settings,
        };
        return status;
      }
      if (path.endsWith("/preview_order"))
        return {
          mail: {
            to: input.event.order.orderCustomer.email,
            subject: "Fixture preview",
            text: "Rendered order fixture",
          },
        };
      if (path.endsWith("/send")) return { state: "queued" };
      throw Error("Unexpected action");
    },
  );
  const view = render(
    <LocaleProvider>
      <EmailPanel request={request} manage={manage} />
    </LocaleProvider>,
  );
  return { request, view };
}
it("loads disabled defaults and shows a preview without enabling delivery", async () => {
  const { request } = setup();
  await screen.findByRole("combobox", { name: "Provider" });
  expect(
    screen.getByRole("button", { name: "Send a real test email" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Test recipient" }), {
    target: { value: "buyer@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview email" }));
  expect(await screen.findByText("Rendered order fixture")).toBeInTheDocument();
  expect(request.mock.calls.some((c) => c[0].endsWith("/send"))).toBe(false);
});
it.each(["resend", "sendgrid", "smtp"])(
  "edits provider %s and saves write-only secrets",
  async (provider) => {
    const { request } = setup();
    await screen.findByRole("combobox", { name: "Provider" });
    fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), {
      target: { value: provider },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Sender email" }), {
      target: { value: "sender@example.test" },
    });
    if (provider !== "smtp")
      fireEvent.change(screen.getByLabelText("API key"), {
        target: { value: "synthetic-key" },
      });
    else {
      fireEvent.change(screen.getByRole("spinbutton", { name: "Port" }), {
        target: { value: "465" },
      });
      fireEvent.change(screen.getByRole("combobox", { name: "Encryption" }), {
        target: { value: "tls" },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save configuration" }),
      ).toBeDisabled(),
    );
    const saved = request.mock.calls.find((c) =>
      c[0].endsWith("/configure"),
    )![1] as Record<string, any>;
    expect(saved.settings.provider).toBe(provider);
    if (provider !== "smtp") {
      expect(saved.credentials.apiKey).toBe("synthetic-key");
      expect(screen.getByLabelText("API key")).toHaveValue("");
    }
  },
);
it("retains unsaved settings when a new locale request function arrives", async () => {
  const { request, view } = setup();
  await screen.findByRole("textbox", { name: "Sender name" });
  fireEvent.change(screen.getByRole("textbox", { name: "Sender name" }), {
    target: { value: "Keep draft" },
  });
  view.rerender(
    <LocaleProvider>
      <EmailPanel request={(...args) => request(...args)} manage />
    </LocaleProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Sender name" })).toHaveValue(
      "Keep draft",
    ),
  );
});
it("supports editing each language template and disallows testing unsaved data", async () => {
  setup();
  await screen.findByRole("combobox", { name: "Template language" });
  for (const language of ["en", "de", "fr", "es"]) {
    fireEvent.change(
      screen.getByRole("combobox", { name: "Template language" }),
      { target: { value: language } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), {
      target: { value: "Subject " + language },
    });
  }
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "Text fixture" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "HTML alternative (optional)" }),
    { target: { value: "<p>{firstName}</p>" } },
  );
  expect(screen.getByRole("button", { name: "Preview email" })).toBeDisabled();
});
it("makes settings and sending read-only without manage rights", async () => {
  setup(false);
  await screen.findByRole("combobox", { name: "Provider" });
  expect(screen.getByRole("combobox", { name: "Provider" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Save configuration" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Preview email" })).toBeDisabled();
});
it("surfaces a failed status action", async () => {
  render(
    <LocaleProvider>
      <EmailPanel
        request={vi.fn().mockRejectedValue(new Error("fixture denial"))}
        manage
      />
    </LocaleProvider>,
  );
  expect(await screen.findByRole("alert")).toBeInTheDocument();
});
it("queues only an explicit test when delivery is enabled in test mode", async () => {
  const status = mailStatus({ ...mailSettings, enabled: true });
  const request = vi.fn(async (path: string) =>
    path.endsWith("/status")
      ? status
      : path.endsWith("/preview_order")
        ? {
            mail: {
              to: "buyer@example.test",
              subject: "fixture",
              text: "fixture",
            },
          }
        : { state: "queued" },
  );
  render(
    <LocaleProvider>
      <EmailPanel request={request} manage />
    </LocaleProvider>,
  );
  await screen.findByRole("textbox", { name: "Test recipient" });
  fireEvent.change(screen.getByRole("textbox", { name: "Test recipient" }), {
    target: { value: "buyer@example.test" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Queue a test without sending" }),
  );
  await waitFor(() =>
    expect(request.mock.calls.some((c) => c[0].endsWith("/send"))).toBe(true),
  );
  expect(
    screen.getByRole("button", { name: "Send a real test email" }),
  ).toBeDisabled();
});
