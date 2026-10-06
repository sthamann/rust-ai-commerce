/** Tenant-scoped account loading and mutation lifecycle; expired sessions clear private data and reopen sign-in. */
import { useCallback, useEffect, useRef, useState } from "react";
import { shopApi, type Cart } from "../../shared/api/shop-api";
import { shopScope } from "../../shared/api/shop-scope";
import { downloadFile } from "../../shared/api/download";
import { useAccountText } from "../../shared/i18n/account-i18n";
import type {
  AccountProfile,
  AccountOptions,
  CustomerOrder,
  CustomerDownload,
  CustomerOrderPage,
} from "./account-types";
export function useCustomerAccount(
  cart: Cart | undefined,
  onCart: (cart: Cart) => void,
) {
  const { a } = useAccountText();
  const key = `rac-customer:${shopScope()}`;
  const [signed, setSigned] = useState(!!localStorage.getItem(key));
  const [profile, setProfile] = useState<AccountProfile>();
  const [options, setOptions] = useState<AccountOptions>();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>();
  const [downloads, setDownloads] = useState<CustomerDownload[]>([]);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [feedback, setFeedback] = useState("");
  const inflight = useRef(false),
    generation = useRef(0);
  const clear = useCallback(() => {
    generation.current++;
    localStorage.removeItem(key);
    setSigned(false);
    setProfile(undefined);
    setOrders([]);
    setNextCursor(undefined);
    setDownloads([]);
    setOptions(undefined);
    setFeedback("");
  }, [key]);
  const failure = (e: unknown) => {
    const detail = e as { status?: number; diagnostic?: string };
    if (
      detail.status === 401 &&
      detail.diagnostic !== "Invalid credentials" &&
      signed
    ) {
      clear();
      setError(a("sessionExpired"));
    } else setError((e as Error).message);
  };
  const expiredMessage = a("sessionExpired");
  const request = useCallback(
    async (path: string, body?: unknown, method?: string) => {
      try {
        return await shopApi<any>(path, body, undefined, method);
      } catch (e) {
        if ((e as { status?: number }).status === 401) {
          clear();
          setError(expiredMessage);
        }
        throw e;
      }
    },
    [clear, expiredMessage],
  );
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const [p, o, d, list] = await Promise.all([
        shopApi<AccountProfile>("/store-api/account/profile"),
        shopApi<AccountOptions>(
          "/store-api/checkout/options",
          undefined,
          cart?.token,
        ),
        shopApi<{ elements: CustomerDownload[] }>(
          "/store-api/account/downloads",
        ),
        shopApi<CustomerOrderPage>("/store-api/account/orders"),
      ]);
      if (current !== generation.current) return;
      setProfile(p);
      setOptions(o);
      setDownloads(d.elements);
      setOrders(list.elements);
      setNextCursor(list.nextCursor);
    } catch (error) {
      if (current === generation.current) throw error;
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [cart?.token]);
  useEffect(() => {
    if (signed) void load().catch(failure);
    return () => {
      generation.current++;
    };
  }, [signed, load]);
  const run = async (fn: () => Promise<void>, message = "") => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await fn();
      setFeedback(message);
    } catch (e) {
      failure(e);
    } finally {
      inflight.current = false;
      setBusy(false);
      setLoading(false);
    }
  };
  const moreOrders = () =>
    run(async () => {
      if (!nextCursor) return;
      const current = generation.current;
      const page = await shopApi<CustomerOrderPage>(
        `/store-api/account/orders?after=${encodeURIComponent(nextCursor)}`,
      );
      if (current !== generation.current) return;
      setOrders((previous) => {
        const ids = new Set(previous.map((o) => o.id));
        return [...previous, ...page.elements.filter((o) => !ids.has(o.id))];
      });
      setNextCursor(page.nextCursor);
    });
  const download = (path: string) =>
    run(() =>
      downloadFile(path, {
        "x-tenant": shopScope(),
        "x-customer-token": localStorage.getItem(key) ?? "",
      }),
    );
  const logout = () =>
    run(async () => {
      await shopApi("/store-api/account/logout", {}, cart?.token);
      clear();
      onCart(await shopApi<Cart>("/store-api/checkout/cart", {}));
    });
  return {
    key,
    signed,
    setSigned,
    profile,
    setProfile,
    options,
    orders,
    nextCursor,
    moreOrders,
    downloads,
    loading,
    busy,
    error,
    feedback,
    failure,
    request,
    load,
    run,
    download,
    logout,
  };
}
