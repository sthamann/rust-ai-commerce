/** Receipt and Google-address behavior against synthetic provider replies; no paid requests. */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { cart } from "./fixtures";
import type { Order } from "../../src/shared/api/shop-api";
import OrderCompletion from "../../src/storefront/checkout/OrderCompletion";
import GoogleAddressSearch from "../../src/shared/customer/GoogleAddressSearch";
import {
  addressFromPlace,
  type AddressComponent,
} from "../../src/shared/customer/google-address";
import { emptyAddress } from "../../src/shared/customer/customer-types";
const google = vi.hoisted(() => ({ key: "", load: vi.fn() }));
vi.mock("../../src/shared/customer/google-address", async (original) => ({
  ...(await original<
    typeof import("../../src/shared/customer/google-address")
  >()),
  browserPlacesKey: () => google.key,
  loadPlaces: google.load,
}));
vi.mock("../../src/storefront/checkout/PaymentSession", () => ({
  default: () => <p>Provider confirmation pending</p>,
}));
const part = (
  type: string,
  text: string,
  shortText = text,
): AddressComponent => ({ types: [type], longText: text, shortText });
const address = {
  ...emptyAddress("DE"),
  name: "Fixture Buyer",
  firstName: "Fixture",
  lastName: "Buyer",
  street: "Test Street 1",
  city: "Test",
  postalCode: "12345",
};
const components = (country = "DE") => [
  part("country", country),
  part("route", "Fixture Road"),
  part("street_number", "8"),
  part("postal_code", "12345"),
  part("locality", "Fixture City"),
];
beforeEach(() => {
  google.key = "";
  google.load.mockReset();
});
describe("International Places address mapping", () => {
  it("preserves contact/apartment data, replaces geographic fields and clears obsolete state", () => {
    const result = addressFromPlace(components(), {
      ...address,
      countryStateId: "US-CA",
      additionalAddressLine1: "Unit 4",
    });
    expect(result).toMatchObject({
      name: "Fixture Buyer",
      street: "Fixture Road 8",
      country: "DE",
      countryStateId: "",
      additionalAddressLine1: "Unit 4",
    });
  });
  it("uses UK postal towns and US ZIP suffix/state without fabricating missing house numbers", () => {
    expect(
      addressFromPlace(
        [...components("GB"), part("postal_town", "Postal Town")],
        address,
      ),
    ).toMatchObject({ street: "8 Fixture Road", city: "Postal Town" });
    expect(
      addressFromPlace(
        [
          ...components("US"),
          part("postal_code_suffix", "6789"),
          part("administrative_area_level_1", "California", "CA"),
        ],
        address,
      ),
    ).toMatchObject({
      street: "8 Fixture Road",
      postalCode: "12345-6789",
      countryStateId: "US-CA",
    });
    expect(
      addressFromPlace(
        components().filter((v) => !v.types.includes("street_number")),
        address,
      ).street,
    ).toBe("Fixture Road");
  });
});
function search(onChange = vi.fn()) {
  return render(
    <LocaleProvider>
      <GoogleAddressSearch
        value={address}
        onChange={onChange}
        countries={["DE"]}
        disabled={false}
      />
    </LocaleProvider>,
  );
}
function library() {
  class Widget extends HTMLElement {
    includedRegionCodes: string[] = [];
  }
  if (!customElements.get("fixture-places"))
    customElements.define("fixture-places", Widget);
  google.load.mockResolvedValue({
    PlaceAutocompleteElement: customElements.get("fixture-places"),
  });
}
describe("Optional Google address search", () => {
  it("has no script/provider call without configuration or before explicit activation", () => {
    const { unmount } = search();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();
    google.key = "fixture-browser-key";
    search();
    expect(
      screen.getByRole("button", { name: "Find address with Google" }),
    ).toBeInTheDocument();
    expect(google.load).not.toHaveBeenCalled();
  });
  it("fills the form only for deliverable countries and requests only address components", async () => {
    google.key = "fixture";
    library();
    const changed = vi.fn();
    const { container } = search(changed);
    fireEvent.click(screen.getByRole("button"));
    const widget = await waitFor(() => {
      const element = container.querySelector("fixture-places");
      expect(element).toBeTruthy();
      return element!;
    });
    const fetchFields = vi.fn().mockResolvedValue(undefined);
    const dispatch = (country: string) =>
      widget.dispatchEvent(
        Object.assign(new Event("gmp-select"), {
          placePrediction: {
            toPlace: () => ({
              addressComponents: components(country),
              fetchFields,
            }),
          },
        }),
      );
    await act(async () => {
      dispatch("US");
    });
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("We do not deliver");
    await act(async () => {
      dispatch("DE");
    });
    expect(changed).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ street: "Fixture Road 8", country: "DE" }),
    );
    expect(fetchFields).toHaveBeenCalledWith({ fields: ["addressComponents"] });
  });
  it("ignores an old reply arriving after a more recent selection", async () => {
    google.key = "fixture";
    library();
    const changed = vi.fn();
    const { container } = search(changed);
    fireEvent.click(screen.getByRole("button"));
    const widget = await waitFor(() => {
      const w = container.querySelector("fixture-places");
      expect(w).toBeTruthy();
      return w!;
    });
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const dispatch = (name: string, fetchFields: () => Promise<void>) =>
      widget.dispatchEvent(
        Object.assign(new Event("gmp-select"), {
          placePrediction: {
            toPlace: () => ({
              addressComponents: [...components(), part("postal_town", name)],
              fetchFields,
            }),
          },
        }),
      );
    await act(async () => {
      dispatch("Old", () => pending);
      dispatch("Latest", async () => {});
    });
    await act(async () => {
      finish();
      await pending;
    });
    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].city).toBe("Latest");
  });
  it("retains manual entry when the provider fails", async () => {
    google.key = "fixture";
    google.load.mockRejectedValue(new Error("Unavailable"));
    search();
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText(
      "Address search is unavailable. Please enter your address below.",
    );
  });
});
it("renders an accepted order's exact snapshot, addresses and honest simulated status", () => {
  const accepted: Order = {
    id: "order-fixture",
    orderNumber: "V-123",
    revision: 1,
    state: "open",
    cart: {
      ...cart,
      checkout: { ...cart.checkout, address, billingAddress: address },
      lineItems: [
        {
          id: "shirt-m",
          label: "Fixture shirt M",
          quantity: 2,
          minPurchase: 1,
          purchaseSteps: 1,
          price: { unitPrice: 25, totalPrice: 50 },
        },
      ],
    },
    payment: { provider: "demo", state: "paid", realMoneyCharged: false },
  };
  const back = vi.fn();
  render(
    <LocaleProvider>
      <OrderCompletion order={accepted} onBack={back} />
    </LocaleProvider>,
  );
  expect(screen.getByText("V-123")).toBeInTheDocument();
  expect(screen.getAllByText("Test Street 1")).toHaveLength(2);
  expect(screen.getByText("Fixture shirt M")).toBeInTheDocument();
  expect(screen.getByText("Test payment · no real money")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back to the shop" }));
  expect(back).toHaveBeenCalledOnce();
});
