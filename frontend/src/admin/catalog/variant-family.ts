/** Cursor-based family lookup for duplicate review, bounded independently of the 50-row creation limit. */
import type { RequestFn } from "../shell/studio-types";
export async function variantFamily(request: RequestFn, parent: string) {
  const children: {
    id: string;
    options: Record<string, string>;
    productNumber: string;
    price: number;
    stock: number;
  }[] = [];
  let cursor = "";
  for (let page = 0; page < 100; page++) {
    const family = await request(
      `/api/merchant/products?limit=100&parentId=${encodeURIComponent(parent)}${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`,
    );
    children.push(...family.elements);
    if (!family.nextCursor) return children;
    cursor = family.nextCursor;
  }
  throw Error("Variant family exceeds 10,000 records");
}
