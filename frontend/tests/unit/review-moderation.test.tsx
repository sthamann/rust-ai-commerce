/** Product-specific moderation respects API failures and publishes only after confirmation. */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import ReviewModeration from "../../src/admin/catalog/ReviewModeration";
const review = {
  id: "r1",
  productId: "lamp",
  author: "Fixture",
  title: "Useful lamp",
  content: "Fixture review",
  rating: 4,
  approved: false,
};
it("filters other products and toggles publication only after the API accepts it", async () => {
  const request = vi.fn(
    async (path: string, _body?: unknown, _method?: string) =>
      path === "/api/merchant/commerce"
        ? {
            reviews: [
              review,
              {
                ...review,
                id: "r2",
                productId: "chair",
                title: "Other product",
              },
            ],
          }
        : {},
  );
  render(<ReviewModeration request={request} productId="lamp" />, {
    wrapper: LocaleProvider,
  });
  await screen.findByText("Useful lamp");
  expect(screen.queryByText("Other product")).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button"));
  expect(request).toHaveBeenLastCalledWith(
    "/api/merchant/reviews/r1",
    { approved: true },
    "PUT",
  );
  await waitFor(() =>
    expect(screen.getByRole("button")).toHaveTextContent("Hide"),
  );
  await user.click(screen.getByRole("button"));
  expect(request).toHaveBeenLastCalledWith(
    "/api/merchant/reviews/r1",
    { approved: false },
    "PUT",
  );
});
it("retains publication state and displays a rejected change", async () => {
  const request = vi.fn(async (path: string) => {
    if (path === "/api/merchant/commerce") return { reviews: [review] };
    throw new Error("Not permitted");
  });
  render(<ReviewModeration request={request} productId="lamp" />, {
    wrapper: LocaleProvider,
  });
  await screen.findByText("Useful lamp");
  await userEvent.setup().click(screen.getByRole("button"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Not permitted");
  expect(screen.getByRole("button")).toBeEnabled();
});
it("reports failed reads and ignores results after unmount", async () => {
  const request = vi
    .fn()
    .mockRejectedValue(new Error("Review service offline"));
  const first = render(
    <ReviewModeration request={request} productId="lamp" />,
    { wrapper: LocaleProvider },
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Review service offline",
  );
  first.unmount();
  let resolve!: (value: unknown) => void;
  const second = render(
    <ReviewModeration
      request={() =>
        new Promise((r) => {
          resolve = r;
        })
      }
      productId="lamp"
    />,
  );
  second.unmount();
  resolve({ reviews: [review] });
});
it("clears old product reviews while the next product is loading", async () => {
  let reply!: (value: unknown) => void;
  const request = vi
    .fn()
    .mockResolvedValueOnce({ reviews: [review] })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
    );
  const view = render(<ReviewModeration request={request} productId="lamp" />, {
    wrapper: LocaleProvider,
  });
  await screen.findByText("Useful lamp");
  view.rerender(<ReviewModeration request={request} productId="chair" />);
  expect(screen.queryByText("Useful lamp")).not.toBeInTheDocument();
  await act(async () => reply({ reviews: [] }));
});
