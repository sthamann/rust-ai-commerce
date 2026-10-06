/** Regression: variant labels must preserve apparel sizes and explicit product units. */
import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ProductPurchase, {
  type ProductPurchaseProps,
} from "../../src/storefront/catalog/ProductPurchase";
function purchase(size: string) {
  const noop = vi.fn();
  const product = {
    id: "coat",
    name: "Coat",
    category: "outerwear",
    description: "",
    options: { size },
    stock: 30,
    min_purchase: 1,
    purchase_steps: 1,
  };
  const props = {
    s: (key: string) => key,
    p: product,
    data: {
      reviews: { average: 0, count: 0 },
      variants: [{ ...product, id: "coat", options: { size } }],
      variantsPagination: {},
      calculatedPrices: [],
      taxStatus: "gross",
    },
    money: (n: number) => String(n),
    tier: { quantity: 1, price: { unitPrice: 249 }, discountPercent: 0 },
    groups: ["size"],
    variantsLoading: false,
    detailRequest: { current: 1 },
    setVariantsLoading: noop,
    id: "coat",
    setData: noop,
    setError: noop,
    onCart: noop,
    quantity: 1,
    setQuantity: noop,
    effective: 1,
    busy: false,
    onAdd: noop,
  } as unknown as ProductPurchaseProps;
  render(<ProductPurchase {...props} />);
}
vi.mock("../../src/shared/apps/AppSlot", () => ({ default: () => null }));
vi.mock("../../src/shared/apps/AppSurfaces", () => ({
  AppSurfaceSlot: () => null,
}));
test.each(["M", "42", "350 ml"])(
  "renders %s without inventing a unit",
  (size) => {
    purchase(size);
    expect(screen.getByRole("button", { name: size })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: size + " ml" }),
    ).not.toBeInTheDocument();
  },
);
