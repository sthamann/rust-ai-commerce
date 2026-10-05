/** Cart lifecycle, authoritative checkout commands and storefront coordination. */
import { shopScope } from "../../shared/api/shop-scope";
import { useCompanyIdentity } from "./useCompanyIdentity";
import { useCatalog } from "./useCatalog";
import { usePersonalization } from "./usePersonalization";

import { useEffect, useRef, useState } from "react";
import {
  shopApi,
  type Cart,
  type Order,
  type Selection,
} from "../../shared/api/shop-api";
import { responseError } from "../../shared/i18n/errors-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import "../../shared/styles/apps.css";
import "../../shared/styles/workbench.css";
import { commerceEvent } from "../analytics/ShopAnalytics";
import "../styles/shop.css";

const session = localStorage.getItem("rac-session") || crypto.randomUUID();
localStorage.setItem("rac-session", session);
function productId() {
  try {
    return location.hash.startsWith("#product/")
      ? decodeURIComponent(location.hash.slice(9))
      : "";
  } catch {
    return "";
  }
}

export function useStorefrontController({
  onMerchant,
}: {
  onMerchant: () => void;
}) {
  const { s, t, money, locale, setLocale } = useShopText();
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
    setAdaptation,
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
  };
  useEffect(() => {
    const hash = () => {
      setId(productId());
      setAppPath(location.hash);
      if (productId()) window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", hash);
    return () => window.removeEventListener("hashchange", hash);
  }, []);
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
            if (c.status !== "open" && !location.hash.startsWith("#payment/"))
              c = await shopApi<Cart>("/store-api/checkout/cart", { session });
          } catch {
            c = await shopApi<Cart>("/store-api/checkout/cart", { session });
          }
        if (!active) return;
        save(c);
        const exp = await shopApi<{ variant: string; headline?: string }>(
          "/api/experience",
          { session },
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
  const add = (pid: string, q: number) =>
    run(async () => {
      if (!cart) return;
      save(
        await shopApi<Cart>(
          "/store-api/checkout/cart/line-item",
          { items: [{ referencedId: pid, quantity: q }] },
          cart.token,
        ),
      );
      const item = products.find((p) => p.id === pid);
      const actual = cart.lineItems.find((i) => i.id === pid);
      commerceEvent("add_to_cart", {
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
      if (!cart) return;
      save(
        await shopApi<Cart>(
          "/store-api/checkout/cart",
          {
            revision: cart.revision,
            items: cart.lineItems
              .map((i) => ({
                id: i.id,
                quantity: i.id === pid ? q : i.quantity,
              }))
              .filter((i) => i.quantity > 0),
          },
          cart.token,
          "PUT",
        ),
      );
    });
  const selection = async (checkout: Selection) => {
    if (!cart) return;
    save(
      await shopApi<Cart>(
        "/store-api/checkout/context",
        { revision: cart.revision, checkout },
        cart.token,
        "PUT",
      ),
    );
  };
  const buy = () =>
    run(async () => {
      if (!cart) return;
      const r = await fetch("/store-api/checkout/order", {
        method: "POST",
        headers: {
          "sw-context-token": cart.token,
          "Idempotency-Key": `browser-${cart.id}`,
          "x-commerce-locale": locale,
          "x-tenant": shopTenant,
          "sw-sales-channel-id": salesChannel,
          ...(new URLSearchParams(location.search).get("sandbox") === "1"
            ? {
                Authorization: `Bearer ${sessionStorage.getItem("rac-user-token")}`,
              }
            : {}),
        },
      });
      const o = await r.json();
      if (!r.ok)
        throw responseError(o.errors?.[0]?.detail ?? "Order failed", r.status);
      setOrder(o);
      if (o.payment.attemptId) {
        setCart(
          await shopApi<Cart>(
            "/store-api/checkout/cart",
            undefined,
            cart.token,
          ),
        );
        localStorage.setItem(
          `rac-payment-token:${o.payment.attemptId}`,
          cart.token,
        );
        return;
      }
      const next = await shopApi<Cart>("/store-api/checkout/cart", { session });
      save(next);
    });

  return {
    company,
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
    setAdaptation,
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
