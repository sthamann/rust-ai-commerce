/** Cursor catalogue loading, debounced filters and stale-response protection. */
import { useEffect, useRef, useState } from "react";
import { shopApi, type Cart, type Product } from "../../shared/api/shop-api";
export function useCatalog(
  cart: Cart | undefined,
  locale: string,
  setError: (value: string) => void,
) {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageCursor, setPageCursor] = useState<string>();
  const [catalogLoading, setCatalogLoading] = useState(false);
  const catalogRequest = useRef(0);
  const catalog = async (token?: string, after?: string) => {
    const request = ++catalogRequest.current;
    setCatalogLoading(true);
    try {
      const page = await shopApi<{
        elements: Product[];
        nextCursor: string | null;
      }>(
        "/store-api/product",
        {
          limit: 50,
          after,
          search: query.trim() || undefined,
          categoryId: category === "all" ? undefined : category,
        },
        token,
      );
      if (request === catalogRequest.current) {
        setProducts(page.elements);
        setNextCursor(page.nextCursor);
        setPageCursor(after);
      }
    } finally {
      if (request === catalogRequest.current) setCatalogLoading(false);
    }
  };
  useEffect(() => {
    if (!cart) return;
    let active = true;
    const timer = window.setTimeout(
      () => {
        catalog(cart.token).catch((e) => {
          if (active) setError((e as Error).message);
        });
      },
      query ? 200 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
      ++catalogRequest.current;
    };
  }, [
    query,
    category,
    locale,
    cart?.token,
    cart?.customerGroup,
    cart?.checkout.country,
    cart?.price.currency,
  ]);
  return {
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
  };
}
