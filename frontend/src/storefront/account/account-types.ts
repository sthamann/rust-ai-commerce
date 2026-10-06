/** Shopper-only account responses deliberately exclude cart/session credentials and internal order activity. */
import type { Cart, Order, Payment } from "../../shared/api/shop-api";
import type {
  Address,
  AddressList,
  Contact,
} from "../../shared/customer/customer-types";
export type AccountProfile = {
  email: string;
  customerNumber: string;
  revision: number;
  orderCount?: number;
  profile: Contact;
  addresses?: AddressList;
};
export type AccountOptions = { countries: string[]; payments: Payment[] };
export type CustomerDownload = {
  id: string;
  orderId: string;
  name?: string;
  title: Record<string, string>;
  filename: string;
};
export type CustomerReceipt = {
  id: string;
  kind: string;
  number: string;
  createdAt: string;
  locale: string;
  pdfPath: string;
};
export type CustomerOrder = Omit<Order, "cart"> & {
  cart: Pick<Cart, "id" | "price" | "shippingCosts" | "lineItems">;
  createdAt?: string;
  orderDateTime?: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  receipts?: CustomerReceipt[];
  stateLabels?: Record<string, Record<string, string>>;
};
export type AccountPage =
  "overview" | "profile" | "addresses" | "orders" | "downloads" | "security";

export type CustomerOrderPage = {
  elements: CustomerOrder[];
  nextCursor?: string | null;
};
