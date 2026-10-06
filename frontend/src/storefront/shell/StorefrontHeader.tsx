/** StorefrontHeader: storefront view composed from the scoped cart/controller. */
import { openConsent } from "../../shared/legal/consent-store";
import { collectionURL } from "../catalog/product-url";
import { shopApi, type Cart } from "../../shared/api/shop-api";
import { StorefrontAppNavigation } from "../../shared/apps/AppSurfaces";
import StorefrontLanguage from "./StorefrontLanguage";
import "../../shared/styles/apps.css";
import "../../shared/styles/workbench.css";
import Icon from "../../shared/ui/Icon";
import "../styles/shop.css";

import { useStorefront } from "./StorefrontContext";
export default function StorefrontHeader() {
  const {
    company,
    s,
    busy,
    cart,
    run,
    save,
    setAccount,
    w,
    onMerchant,
    adaptation,
    shopTenant,
    products,
    openBag,
  } = useStorefront();
  const displayName =
    company.brandName ||
    company.name ||
    (shopTenant === "nord-atelier" &&
    products.some((p) => p.media[0]?.url.startsWith("/media/demo/fashion/"))
      ? s("fashionBrand")
      : shopTenant);
  return (
    <header className="shop-nav">
      <a href={collectionURL()} className="shop-brand">
        {company.logoUrl && (
          <img
            src={company.logoUrl}
            alt={displayName}
            className="company-brand-logo"
          />
        )}
        {displayName}
        <span> / </span>
      </a>
      <nav>
        <a href={collectionURL()}>{s("collection")}</a>
        <StorefrontAppNavigation />
        <button
          disabled={busy || !cart}
          onClick={() =>
            run(async () => {
              if (!cart || cart.customerGroup === "business") return;
              const c = await shopApi<Cart>(
                "/store-api/account/login",
                { email: "buyer@example.test", password: "demo-business" },
                cart.token,
              );
              save(c);
            })
          }
        >
          {cart?.customerGroup === "business"
            ? "Example Studio · B2B"
            : s("business")}
        </button>
        <button onClick={() => setAccount(true)}>{w("account")}</button>
        <button onClick={onMerchant}>{s("studio")} ↗</button>
      </nav>
      <StorefrontLanguage />
      <button
        className="shop-text-button"
        aria-pressed={adaptation}
        onClick={openConsent}
      >
        {w(adaptation ? "adaptationOn" : "adaptationOff")}
      </button>
      <button className="shop-bag-button" disabled={busy} onClick={openBag}>
        <Icon name="box" size={18} />
        {s("bag")}{" "}
        <b>
          {cart?.status === "completed"
            ? 0
            : (cart?.lineItems.reduce((n, i) => n + i.quantity, 0) ?? 0)}
        </b>
      </button>
    </header>
  );
}
