/** Canonical catalogue facts shown alongside graph evidence; prices and inventory come from current product state. */
import { useCatalogText } from "../catalog/catalog-i18n";
import { useKnowledgeText } from "../../shared/i18n/knowledge-i18n";
import { useLocale } from "../../shared/i18n/i18n";
import type { Product } from "../shell/studio-types";
export default function KnowledgeFacts({
  product,
  stats,
}: {
  product: Product & {
    product_number: string;
    properties: Record<string, unknown>;
    extra: {
      specifications?: Record<string, unknown>;
      identity?: { manufacturer?: string };
    };
  };
  stats: { variants: number; reviews: number; averageRating: number };
}) {
  const { c } = useCatalogText(),
    k = useKnowledgeText(),
    { money, number } = useLocale();
  const facts = [
    ...Object.entries(product.properties ?? {}),
    ...Object.entries(product.extra?.specifications ?? {}),
  ];
  const text = (v: unknown) =>
    typeof v === "string"
      ? v
      : typeof v === "number"
        ? number(v)
        : Array.isArray(v)
          ? v
              .filter((n) => typeof n === "string" || typeof n === "number")
              .join(", ")
          : JSON.stringify(v);
  return (
    <section className="studio-card">
      <h2>{k("snapshot")}</h2>
      <dl className="knowledge-facts">
        <div>
          <dt>{c("number")}</dt>
          <dd>{product.product_number || product.id}</dd>
        </div>
        <div>
          <dt>{c("price")}</dt>
          <dd>{money(product.price)}</dd>
        </div>
        <div>
          <dt>{c("stock")}</dt>
          <dd>{number(product.stock)}</dd>
        </div>
        <div>
          <dt>{c("variants")}</dt>
          <dd>{number(stats.variants)}</dd>
        </div>
        <div>
          <dt>{k("reviews")}</dt>
          <dd>
            {number(stats.reviews)} · {number(stats.averageRating)}
          </dd>
        </div>
        <div>
          <dt>{k("revision")}</dt>
          <dd>{number(product.revision)}</dd>
        </div>
        {product.extra?.identity?.manufacturer && (
          <div>
            <dt>{c("manufacturer")}</dt>
            <dd>{product.extra.identity.manufacturer}</dd>
          </div>
        )}
        {facts.map(([key, value], i) => (
          <div key={`${key}:${i}`}>
            <dt>{key}</dt>
            <dd>{text(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
