/** Customer consent and real GA4 ecommerce events; absent apps produce no external script. */
import { useEffect, useRef, useState } from "react";
import {
  createAnalytics,
  type Analytics,
} from "../../../../extensions/sdk/analytics";
import {
  shopApi,
  type Cart,
  type Order,
  type Product,
} from "../../shared/api/shop-api";
import { usePurpose } from "../../shared/legal/consent-store";
let current: Analytics | undefined;
export const commerceEvent = (name: string, data: unknown) =>
  current?.event(name, data);
export const analyticsItems = (products: Product[]) =>
  products.map((p) => ({
    item_id: p.id,
    item_name: p.name,
    price: p.calculated_price?.unitPrice ?? p.price,
    quantity: 1,
  }));
export default function ShopAnalytics({
  shop,
  channel,
  products,
  cart,
  bag,
  order,
}: {
  shop: string;
  channel: string;
  products: Product[];
  cart?: Cart;
  bag: boolean;
  order?: Order;
}) {
  const allowed = usePurpose("analytics");
  const [choice, setChoice] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const client = useRef<Analytics | undefined>(undefined);
  const lastList = useRef("");
  const checkout = useRef(false);
  useEffect(() => {
    let active = true;
    shopApi<{ measurementId?: string }>(
      "/store-api/apps/google_analytics/actions/tracking",
      { salesChannel: channel },
    )
      .then((v) => {
        if (!active || !v.measurementId) return;
        client.current = createAnalytics({
          shop,
          channel,
          measurementId: v.measurementId,
          managedConsent: true,
        });
        current = client.current;
        setChoice(null);
        setConfigured(true);
      })
      .catch(() => {});
    return () => {
      active = false;
      client.current?.dispose();
      if (current === client.current) current = undefined;
    };
  }, [shop, channel]);
  useEffect(() => {
    if (configured && choice === "granted")
      window.dispatchEvent(new Event("commerce:analytics-ready"));
  }, [configured, choice]);
  useEffect(() => {
    const signature = `${cart?.price.currency}:${products.map((p) => p.id).join(",")}`;
    if (
      client.current?.enabled() &&
      products.length &&
      signature !== lastList.current
    ) {
      client.current.event("view_item_list", {
        currency: cart?.price.currency ?? "EUR",
        items: analyticsItems(products),
      });
      lastList.current = signature;
    }
  }, [products, cart?.price.currency, choice, configured]);
  useEffect(() => {
    if (
      bag &&
      !checkout.current &&
      cart?.lineItems.length &&
      client.current?.enabled()
    ) {
      client.current?.event("begin_checkout", {
        currency: cart.price.currency ?? "EUR",
        value: cart.price.totalPrice,
        items: cart.lineItems.map((i) => ({
          item_id: i.id,
          item_name: i.label,
          price: i.price.unitPrice,
          quantity: i.quantity,
        })),
      });
    }
    checkout.current = bag && !!client.current?.enabled();
  }, [bag, cart, choice]);
  useEffect(() => {
    if (order)
      client.current?.event("purchase", {
        transaction_id: order.id,
        currency: order.cart.price.currency ?? "EUR",
        value: order.cart.price.totalPrice,
        items: order.cart.lineItems.map((i) => ({
          item_id: i.id,
          item_name: i.label,
          price: i.price.unitPrice,
          quantity: i.quantity,
        })),
      });
  }, [order, choice]);
  useEffect(() => {
    if (!configured) return;
    client.current?.consent(allowed);
    setChoice(allowed ? "granted" : "denied");
  }, [allowed, configured]);
  return null;
}
