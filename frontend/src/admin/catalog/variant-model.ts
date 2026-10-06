/** Bounded option combinations and metadata-free child payloads shared by the guided variant creator. */
import type { ProductDraft } from "./catalog-model";
export type Axis = { name: string; values: string };
export type VariantRow = {
  options: Record<string, string>;
  number: string;
  price: number;
  stock: number;
  selected: boolean;
  created?: string;
  existing?: boolean;
};
export const optionSignature = (options: Record<string, string>) =>
  JSON.stringify(
    Object.entries(options).sort(([a], [b]) => a.localeCompare(b)),
  );
export function variantCombinations(
  axes: Axis[],
  parent: ProductDraft,
): VariantRow[] {
  if (!axes.length || axes.length > 5) throw Error("axes");
  const names = axes.map((a) => a.name.trim());
  if (
    names.some((n) => !n || n.length > 100) ||
    new Set(names).size !== names.length
  )
    throw Error("axes");
  let combinations: Record<string, string>[] = [{}];
  axes.forEach((axis, i) => {
    const values = [
      ...new Set(
        axis.values
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ];
    if (
      !values.length ||
      values.some((v) => v.length > 200) ||
      combinations.length * values.length > 50
    )
      throw Error("limit");
    combinations = combinations.flatMap((c) =>
      values.map((v) => ({ ...c, [names[i]]: v })),
    );
  });
  return combinations.map((options, i) => ({
    options,
    number: `${parent.catalog.productNumber.slice(0, 90)}-${i + 1}`,
    price: parent.commerce.price,
    stock: parent.commerce.stock,
    selected: true,
  }));
}
export function variantPayload(parent: ProductDraft, row: VariantRow) {
  const {
    id,
    channels: _channels,
    mainLocale: _main,
    availableLocales: _locales,
    ...payload
  } = structuredClone(parent);
  return {
    ...payload,
    revision: 0,
    catalog: {
      ...parent.catalog,
      active: false,
      parentId: id,
      productNumber: row.number.trim(),
      options: row.options,
    },
    commerce: { ...parent.commerce, price: row.price, stock: row.stock },
  };
}
