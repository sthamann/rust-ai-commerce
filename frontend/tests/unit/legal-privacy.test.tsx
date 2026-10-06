/** Actual consent and checkout components with synthetic transport; no external provider calls. */
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import PrivacyProvider from "../../src/storefront/legal/PrivacyProvider";
import CheckoutLegal from "../../src/storefront/legal/CheckoutLegal";
import ConsumerRequestForm from "../../src/storefront/legal/ConsumerRequestForm";
import ExternalVideo from "../../src/shared/legal/ExternalVideo";
import {
  consentChoice,
  consentCurrent,
  openConsent,
  publishConsent,
  usePurpose,
} from "../../src/shared/legal/consent-store";
import {
  defaultLegal,
  type LegalPolicy,
} from "../../src/shared/legal/legal-types";
const reply = (value: unknown) => ({
  ok: true,
  status: 200,
  json: async () => value,
});
function transport(strictCheckout = false) {
  const p: LegalPolicy = {
    data: { ...defaultLegal(), strictCheckout },
    policyVersion: "v1",
    mainLocale: "en-GB",
    locales: ["en-GB"],
    salesChannelId: "default",
  };
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url === "/store-api/legal") return reply(p);
    if (init.method === "PUT")
      return reply({
        ...JSON.parse(init.body as string),
        decided: true,
        expiresAt: "2099-01-01T00:00:00Z",
      });
    return reply({ choices: {}, decided: false, policyVersion: "v1" });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function view(children?: React.ReactNode) {
  return render(
    <LocaleProvider>
      <PrivacyProvider token="fixture">{children}</PrivacyProvider>
    </LocaleProvider>,
  );
}
describe("Consent", () => {
  it("denies by default and isolates policies, expiry, tenants and channels", () => {
    const c = {
      choices: { analytics: true },
      decided: true,
      policyVersion: "v1",
      expiresAt: "2099-01-01",
    };
    expect(consentChoice().decided).toBe(false);
    expect(consentCurrent(c, "v2")).toBe(false);
    expect(consentCurrent({ ...c, expiresAt: "2000-01-01" }, "v1")).toBe(false);
    expect(consentCurrent(c, "v1")).toBe(true);
    publishConsent(c);
    history.replaceState(null, "", "/?shop=other&channel=retail");
    expect(consentChoice().decided).toBe(false);
  });
  it("expires a granted purpose at the exact receipt deadline", () => {
    vi.useFakeTimers();
    try {
      const hook = renderHook(() => usePurpose("analytics"));
      act(() =>
        publishConsent({
          choices: { analytics: true },
          decided: true,
          policyVersion: "v1",
          expiresAt: new Date(Date.now() + 1000).toISOString(),
        }),
      );
      expect(hook.result.current).toBe(true);
      act(() => vi.advanceTimersByTime(1000));
      expect(hook.result.current).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("persists explicit acceptance and withdraws through the same dialog", async () => {
    const fetcher = transport();
    view();
    const hook = renderHook(() => usePurpose("analytics"));
    await screen.findByRole("button", { name: "Reject optional" });
    expect(hook.result.current).toBe(false);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Accept optional" })),
    );
    await waitFor(() => expect(hook.result.current).toBe(true));
    act(() => openConsent());
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Reject optional" })),
    );
    expect(hook.result.current).toBe(false);
    expect(
      JSON.parse(fetcher.mock.calls.at(-1)![1].body as string).choices,
    ).toEqual({});
  });
  it("ignores legacy grants, preserves unfinished choices and denies failed saves", async () => {
    localStorage.setItem("rac-analytics:unit-shop:default", "granted");
    const fetcher = transport();
    view();
    await screen.findByRole("button", { name: "Choose individually" });
    fireEvent.click(
      screen.getByRole("button", { name: "Choose individually" }),
    );
    expect(
      screen
        .getAllByRole("checkbox")
        .every((e) => !(e as HTMLInputElement).checked),
    ).toBe(true);
    const check = screen.getByRole("checkbox", { name: "Shop analytics" });
    fireEvent.click(check);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(check).toBeChecked();
    fetcher.mockRejectedValueOnce(new Error("Unavailable"));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Accept optional" })),
    );
    expect(consentChoice().decided).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent("Unavailable");
  });
  it("mounts remote video only with permission and removes it on revocation", () => {
    const { container } = render(
      <LocaleProvider>
        <ExternalVideo url="https://video.example.test/p.mp4" />
      </LocaleProvider>,
    );
    expect(container.querySelector("video")).toBeNull();
    act(() =>
      publishConsent({
        choices: { externalMedia: true },
        decided: true,
        policyVersion: "v1",
      }),
    );
    expect(container.querySelector("video")?.src).toBe(
      "https://video.example.test/p.mp4",
    );
    act(() => publishConsent());
    expect(container.querySelector("video")).toBeNull();
  });
});
describe("Checkout and declarations", () => {
  it("requires separate digital approval and persists exactly at purchase", async () => {
    const fetcher = transport(true),
      ready = vi.fn();
    view(<CheckoutLegal token="fixture" digital onReady={ready} />);
    await screen.findByRole("button", { name: "Reject optional" });
    const checks = screen.getAllByRole("checkbox");
    fireEvent.click(checks[0]);
    expect(ready.mock.calls.at(-1)![0]).toBe(false);
    fireEvent.click(checks[1]);
    expect(ready.mock.calls.at(-1)![0]).toBe(true);
    expect(
      fetcher.mock.calls.filter(([, init]) => init.method === "PUT"),
    ).toHaveLength(0);
    await ready.mock.calls.at(-1)![1]();
    expect(
      fetcher.mock.calls.filter(([, init]) => init.method === "PUT"),
    ).toHaveLength(1);
  });
  it("does not request a digital waiver for physical products", async () => {
    transport(true);
    view(<CheckoutLegal token="fixture" digital={false} onReady={vi.fn()} />);
    await screen.findByRole("button", { name: "Reject optional" });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });
  it("collects a declaration in two steps without refunding or deleting", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      reply({
        id: "receipt",
        data: { receivedAt: "2026-10-06", reference: "V-1" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      <LocaleProvider>
        <ConsumerRequestForm token="fixture" withdrawal />
      </LocaleProvider>,
    );
    const form = screen.getByRole("button").closest("form")!;
    fireEvent.submit(form);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByRole("link")).toHaveAttribute(
        "download",
        "vendune-receipt.txt",
      ),
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.parse(fetcher.mock.calls[0][1].body).kind).toBe("withdrawal");
  });
});
