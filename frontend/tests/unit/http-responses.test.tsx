/** Legacy totals remain unknown; exact status outcomes work in every bundled interface language. */
import { render, screen, within } from "@testing-library/react";
import { it, expect } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import HTTPResponses from "../../src/platform/HTTPResponses";
it("separates access refusals, other 4xx and real 5xx without reclassifying history", () => {
  render(
    <HTTPResponses
      traffic={{
        failures: 20,
        responses: { "401": 2, "403": 3, "404": 4, "429": 1, "500": 2 },
      }}
    />,
    { wrapper: LocaleProvider },
  );
  expect(screen.getByText("Access rejected (401/403):")).toHaveTextContent("5");
  expect(screen.getByText("Other 4xx responses:")).toHaveTextContent("5");
  expect(screen.getByText("Server failures (5xx):")).toHaveTextContent("2");
  expect(screen.getByText("Historical · unclassified:")).toHaveTextContent("8");
  expect(
    within(screen.getByRole("list")).getAllByRole("listitem"),
  ).toHaveLength(5);
});
it("does not turn an old-only backend response into classified successes", () => {
  render(<HTTPResponses traffic={{ failures: 12 }} />, {
    wrapper: LocaleProvider,
  });
  expect(screen.getByText("Historical · unclassified:")).toHaveTextContent(
    "12",
  );
  expect(
    screen.getByText(/No classified HTTP failures recorded yet/),
  ).toBeInTheDocument();
});
