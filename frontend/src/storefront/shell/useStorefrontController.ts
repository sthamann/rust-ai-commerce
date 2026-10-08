/** Cart lifecycle, authoritative checkout commands and storefront coordination. */
import { updateCartQuantity } from "./cart-commands";
import { routeProductId } from "../catalog/product-url";
import { shopScope } from "../../shared/api/shop-scope";
import { useCompanyIdentity } from "./useCompanyIdentity";
import { useStorefrontAnchors } from "./useStorefrontAnchors";
import { useCatalog } from "./useCatalog";
import { channelPreview } from "./ChannelPreview";
import { useConsentedExperience } from "./useConsentedExperience";
import { usePersonalization } from "./usePersonalization";

import { useEffect, useRef, useState } from "react";
import {
  shopApi,
  type Cart,
  type Order,
  type Selection,
} from "../../shared/api/shop-api";
import { placeCheckoutOrder } from "../checkout/checkout-order";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import "../../shared/styles/apps.css";
import "../../shared/styles/workbench.css";
import { commerceEvent } from "../analytics/ShopAnalytics";
import "../styles/shop.css";
import "../styles/checkout.css";
import "../styles/order-completion.css";

const session = localStorage.getItem("rac-session") || crypto.randomUUID();
localStorage.setItem("rac-session", session);
function productId() {
  return routeProductId(new URL(location.href));
}

export function useStorefrontController({
  onMerchant,
}: {
  onMerchant: () => void;
}) {
  const { s, t, locale, setLocale } = useShopText();
  const { w } = useWorkbenchText();
  const shopTenant = shopScope();
  const salesChannel =
    new URLSearchParams(location.search).get("channel") ?? "default";
  const company = useCompanyIdentity(shopTenant, salesChannel, locale);
  const cartKey =
    salesChannel === "default"
      ? `rac-cart:${shopTenant}`
      : `rac-cart:${shopTenant}:${salesChannel}`;
  const transfer = useRef<{ ticket: string; promise: Promise<Cart> } | null>(
    null,
  );
  const [cart, setCart] = useState<Cart>();
  const money = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cart?.price.currency ?? "EUR",
    }).format(n);
  const [id, setId] = useState(productId);
  const [appPath, setAppPath] = useState(location.hash);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bag, setBag] = useState(false);
  const [account, setAccount] = useState(false);
  const [order, setOrder] = useState<Order>();
  const [wish, setWish] = useState("");
  const [advice, setAdvice] = useState<{
    explanation: string;
    recommended_ids: string[];
  }>();
  const [experience, setExperience] = useState<{
    variant: string;
    headline?: string;
  }>();
  const {
    products,
    setProducts,
    query,
    setQuery,
    category,
    setCategory,
    nextCursor,
    setNextCursor,
    pageCursor,
    setPageCursor,
    catalogLoading,
    setCatalogLoading,
    catalogRequest,
    catalog,
  } = useCatalog(cart, locale, setError);
  const {
    ranked,
    setRanked,
    personalized,
    setPersonalized,
    adaptation,
    viewed,
    setViewed,
    affinity,
    adapted,
    rank,
    list,
  } = usePersonalization(products, cart, id, shopTenant);
  const save = (c: Cart) => {
    setCart(c);
    localStorage.setItem(cartKey, c.token);
    if (c.price.currency)
      localStorage.setItem(
        `rac-currency:${shopTenant}:${salesChannel}`,
        c.price.currency,
      );
  };
  useEffect(() => {
    const hash = () => {
      setId(productId());
      setAppPath(location.hash);
      if (productId()) window.scrollTo({ top: 0, behavior: "instant" });
    };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !link ||
        link.target ||
        link.download ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const url = new URL(link.href);
      if (
        url.origin !== location.origin ||
        !(url.pathname === "/" || url.pathname.startsWith("/products/"))
      )
        return;
      if (["#merchant", "#login", "#platform"].includes(url.hash)) return;
      event.preventDefault();
      history.pushState(null, "", url);
      hash();
    };
    window.addEventListener("hashchange", hash);
    window.addEventListener("popstate", hash);
    document.addEventListener("click", navigate);
    return () => {
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("popstate", hash);
      document.removeEventListener("click", navigate);
    };
  }, []);
  useStorefrontAnchors(id, appPath);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = localStorage.getItem(cartKey);
        let c: Cart;
        const ticket = location.hash.startsWith("#checkout/")
          ? location.hash.slice(10)
          : undefined;
        if (ticket) {
          if (transfer.current?.ticket !== ticket)
            transfer.current = {
              ticket,
              promise: shopApi<Cart>("/store-api/checkout/handoff/consume", {
                ticket,
              }),
            };
          c = await transfer.current.promise;
          localStorage.setItem(cartKey, c.token);
          history.replaceState(
            null,
            "",
            `${location.pathname}${location.search}#`,
          );
          setBag(true);
        } else
          try {
            c = await shopApi<Cart>(
              "/store-api/checkout/cart",
              token ? undefined : { session },
              token ?? undefined,
            );
            if (
              c.status === "completed" &&
              c.order &&
              location.hash === "#order-confirmed"
            )
              setOrder(c.order);
            if (
              c.status !== "open" &&
              !location.hash.startsWith("#payment/") &&
              location.hash !== "#order-confirmed"
            )
              c = await shopApi<Cart>("/store-api/checkout/cart", { session });
          } catch {
            c = await shopApi<Cart>("/store-api/checkout/cart", { session });
          }
        if (!active) return;
        save(c);
        if (channelPreview()) return;
        const exp = await shopApi<{ variant: string; headline?: string }>(
          "/api/experience",
          { session },
          c.token,
        );
        if (active) setExperience(exp);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    })();
    return () => {
      active = false;
    };
  }, [locale]);
  useConsentedExperience(cart, adaptation, session, setExperience);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openBag = () =>
    run(async () => {
      if (cart?.status === "completed") {
        save(await shopApi<Cart>("/store-api/checkout/cart", { session }));
        setOrder(undefined);
      }
      setBag(true);
    });
  const add = (pid: string, q: number) =>
    run(async () => {
      if (!cart) return;
      save(
        await shopApi<Cart>(
          "/store-api/checkout/cart/line-item",
          { items: [{ referencedId: pid, quantity: q }] },
          (cart.status === "completed"
            ? await shopApi<Cart>("/store-api/checkout/cart", { session })
            : cart
          ).token,
        ),
      );
      const item = products.find((p) => p.id === pid);
      const actual = cart.lineItems.find((i) => i.id === pid);
      commerceEvent("add_to_cart", {
        currency: cart.price.currency ?? "EUR",
        items: [
          {
            item_id: pid,
            item_name: item?.name ?? actual?.label ?? pid,
            price:
              item?.calculated_price?.unitPrice ??
              item?.price ??
              actual?.price.unitPrice ??
              0,
            quantity: q,
          },
        ],
      });
      setBag(true);
      setOrder(undefined);
    });
  const quantity = (pid: string, q: number) =>
    run(async () => {
      if (cart) save(await updateCartQuantity(cart, pid, q));
    });
  const selection = async (checkout: Selection) => {
    if (!cart) throw new Error(s("empty"));
    const next = await shopApi<Cart>(
      "/store-api/checkout/context",
      { revision: cart.revision, checkout },
      cart.token,
      "PUT",
    );
    save(next);
    return next;
  };
  const buy = async () => {
    if (!cart || busy) return;
    setBusy(true);
    setError("");
    try {
      const o = await placeCheckoutOrder(
        cart,
        locale,
        shopTenant,
        salesChannel,
      );
      setOrder(o);
      if (o.payment.attemptId)
        localStorage.setItem(
          `rac-payment-token:${o.payment.attemptId}`,
          cart.token,
        );
      // Keep the scoped completed-cart token for reload recovery; the next add creates a new cart.
      save({ ...o.cart, token: cart.token, status: "completed", order: o });
      setBag(false);
      location.hash = "order-confirmed";
    } catch (e) {
      // Refresh a stale quote before a second explicit purchase. Never retry a charge silently.
      try {
        save(
          await shopApi<Cart>(
            "/store-api/checkout/cart",
            undefined,
            cart.token,
          ),
        );
      } catch {
        /* preserve the current cart for recovery */
      }
      throw e;
    } finally {
      setBusy(false);
    }
  };

  return {
    company,
    openBag,
    onMerchant,
    s,
    t,
    money,
    locale,
    setLocale,
    w,
    shopTenant,
    salesChannel,
    cartKey,
    transfer,
    products,
    setProducts,
    cart,
    setCart,
    id,
    setId,
    appPath,
    setAppPath,
    busy,
    setBusy,
    error,
    setError,
    bag,
    setBag,
    account,
    setAccount,
    order,
    setOrder,
    query,
    setQuery,
    category,
    setCategory,
    nextCursor,
    setNextCursor,
    pageCursor,
    setPageCursor,
    catalogLoading,
    setCatalogLoading,
    catalogRequest,
    wish,
    setWish,
    advice,
    setAdvice,
    ranked,
    setRanked,
    personalized,
    setPersonalized,
    adaptation,
    viewed,
    setViewed,
    experience,
    setExperience,
    save,
    catalog,
    run,
    add,
    quantity,
    selection,
    buy,
    affinity,
    adapted,
    rank,
    list,
  };
}
export type StorefrontController = ReturnType<typeof useStorefrontController>;
