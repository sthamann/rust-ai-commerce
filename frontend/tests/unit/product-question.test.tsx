/** Product questions cite public evidence and cannot leak stale answers across products. */
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import ProductQuestion from "../../src/storefront/catalog/ProductQuestion";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
const answer = {
  answer: "Fixture: steel housing",
  missingInformation: false,
  sources: [
    {
      sourceId: "public-sheet",
      title: "Unit datasheet",
      excerpt: "<script>Fixture is plain text</script>",
    },
  ],
};
const response = (value: unknown) => ({
  ok: true,
  status: 200,
  json: async () => value,
});
it("submits a tenant-scoped product question and displays evidence as text", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(answer));
  vi.stubGlobal("fetch", fetcher);
  render(<ProductQuestion productId="lamp/blue" />, {
    wrapper: LocaleProvider,
  });
  const user = userEvent.setup();
  expect(screen.getByRole("button")).toBeDisabled();
  await user.type(screen.getByRole("textbox"), "What material?");
  await user.click(screen.getByRole("button"));
  expect(await screen.findByRole("status")).toHaveTextContent(answer.answer);
  expect(fetcher.mock.calls[0][0]).toBe(
    "/store-api/product/lamp%2Fblue/questions",
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    question: "What material?",
  });
  expect(screen.getByText("Unit datasheet")).toBeInTheDocument();
  expect(document.querySelector("script")).toBeNull();
});
it("reports missing knowledge and recovers from an API error", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("Question service offline"))
    .mockResolvedValueOnce(
      response({ ...answer, missingInformation: true, sources: [] }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<ProductQuestion productId="lamp" />, { wrapper: LocaleProvider });
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), "Waterproof?");
  await user.click(screen.getByRole("button"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Question service offline",
  );
  await user.click(screen.getByRole("button"));
  await screen.findByRole("status");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText("Unit datasheet")).not.toBeInTheDocument();
});
it("ignores a previous product answer and releases pending state after navigation", async () => {
  let reply!: (value: unknown) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
    ),
  );
  const view = render(<ProductQuestion productId="lamp" />, {
    wrapper: LocaleProvider,
  });
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), "Material?");
  await user.click(screen.getByRole("button"));
  expect(screen.getByRole("button")).toBeDisabled();
  view.rerender(<ProductQuestion productId="chair" />);
  await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  await act(async () => reply(response(answer)));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
