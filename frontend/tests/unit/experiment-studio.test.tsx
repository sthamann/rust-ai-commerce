/** Native experiments preserve preregistration, current revisions and honest interim readouts. */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ExperimentStudio from "../../src/admin/intelligence/ExperimentStudio";
const permissions = vi.hoisted(() => ({ access: ["settings.write"] }));
vi.mock("../../src/admin/shell/StudioContext", () => ({
  useStudio: () => permissions,
}));
afterEach(() => {
  cleanup();
  permissions.access = ["settings.write"];
});
const row = {
  id: "fixed",
  revision: 2,
  state: "running",
  endsAt: "2099-01-01",
  design: {
    title: "Fixture",
    currency: "JPY",
    channel: "fashion",
    durationHours: 168,
    settlementDays: 30,
  },
};
function transport() {
  return vi.fn(async (path: string, body?: unknown) => {
    if (path === "/api/automation") return { channels: [{ id: "fashion" }] };
    if (path === "/api/merchant/commerce")
      return {
        data: { currencies: { defaultCurrency: "JPY", enabled: ["JPY"] } },
      };
    if (path === "/api/intelligence/experiments") return { experiments: [row] };
    if (path === "/api/intelligence/experiment.report")
      return {
        causalUpliftProven: false,
        unitsPerArm: [1, 1],
        currency: "JPY",
        netCollectedMinor: "1200",
      };
    if (path === "/api/intelligence/experiment.stop")
      throw new Error("Stale revision");
    return { saved: true, body };
  });
}
it("prevents premature finish, displays no unearned uplift and sends the exact current transition revision", async () => {
  const request = transport();
  render(<ExperimentStudio request={request} />);
  const read = await screen.findByRole("button", {
    name: "Aktuellen Stand auswerten",
  });
  expect(
    screen.getByRole("button", { name: "Nach fester Laufzeit beenden" }),
  ).toBeDisabled();
  fireEvent.click(read);
  expect(
    await screen.findByText("Bisher keine positive Wirkung nachgewiesen"),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Vorzeitig abbrechen; Wirkungsauswertung ungültig",
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Stale revision"),
  );
  expect(request).toHaveBeenCalledWith(
    "/api/intelligence/experiment.stop",
    { id: "fixed", revision: 2, approve: true },
    "POST",
  );
});
it("read-only merchants inspect but cannot create or change experiments", async () => {
  permissions.access = ["knowledge.read", "settings.read"];
  render(<ExperimentStudio request={transport()} />);
  await screen.findByText("Fixture");
  expect(
    screen.getByRole("button", { name: "Experiment registrieren" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", {
      name: "Vorzeitig abbrechen; Wirkungsauswertung ungültig",
    }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Aktuellen Stand auswerten" }),
  ).toBeEnabled();
});
