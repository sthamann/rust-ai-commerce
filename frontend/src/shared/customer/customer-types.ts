/** Shared customer/address contracts; merchant and customer sessions use distinct request adapters. */
export type Address = {
  name: string;
  firstName?: string;
  lastName?: string;
  salutationId?: string;
  title?: string;
  company?: string;
  department?: string;
  vatId?: string;
  street: string;
  postalCode: string;
  city: string;
  country?: string;
  countryStateId?: string;
  additionalAddressLine1?: string;
  additionalAddressLine2?: string;
  phoneNumber?: string;
};
export type AddressEntry = { id: string; revision: number; address: Address };
export type AddressList = {
  elements: AddressEntry[];
  defaultBillingAddressId?: string;
  defaultShippingAddressId?: string;
  customerRevision: number;
};
export type Contact = {
  name: string;
  firstName?: string;
  lastName?: string;
  salutationId?: string;
  title?: string;
  company?: string;
  phoneNumber?: string;
  birthday?: string | null;
  vatIds?: string[];
  defaultPaymentMethodId?: string | null;
  address?: Address | null;
};
export function emptyAddress(country = "DE"): Address {
  return {
    name: "",
    firstName: "",
    lastName: "",
    street: "",
    postalCode: "",
    city: "",
    country,
  };
}
export function fullAddress(a?: Address | null): Address {
  const old = a ?? emptyAddress();
  const parts = old.name?.split(" ") ?? [];
  return {
    ...old,
    firstName: old.firstName || parts[0] || "",
    lastName: old.lastName || parts.slice(1).join(" "),
    country: old.country ?? "DE",
  };
}
export function addressComplete(a?: Address | null) {
  return (
    !!a && [a.name, a.street, a.postalCode, a.city].every((v) => v?.trim())
  );
}

/** The exact group ID remains distinct from its admitted price/checkout basis. */
export type CustomerGroup = {
  id: string;
  priceBasis: "consumer" | "business";
  translations: import("../geography/geography-types").TextMap;
};
