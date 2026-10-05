/** Shared Vendune identity; product branding is independent of tenant-owned company logos and session keys. */
import "./brand.css";
export const BRAND = Object.freeze({
  name: "Vendune",
  studio: "Studio",
  repository: "https://github.com/sthamann/vendune",
  mark: "/brand/vendune-mark.svg",
});
export default function Brand({ markOnly = false }: { markOnly?: boolean }) {
  return markOnly ? (
    <img className="vendune-mark" src={BRAND.mark} alt={BRAND.name} />
  ) : (
    <span className="vendune-brand">
      <img className="vendune-mark" src={BRAND.mark} alt="" />
      <span className="vendune-wordmark">
        {BRAND.name}
        <small>{BRAND.studio}</small>
      </span>
    </span>
  );
}
