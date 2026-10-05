/** StorefrontHeader: storefront view composed from the scoped cart/controller. */
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
    setAdaptation,
    shopTenant,
    setRanked,
    setPersonalized,
    setViewed,
    setBag,
  } = useStorefront();
  return (
    <header className="shop-nav">
      <a href="#" className="shop-brand">
        {company.logoUrl && (
          <img
            src={company.logoUrl}
            alt={company.brandName || company.name || shopTenant}
            className="company-brand-logo"
          />
        )}
        {company.brandName || company.name || shopTenant}
        <span> / </span>
      </a>
      <nav>
        <a href="#">{s("collection")}</a>
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
        onClick={() => {
          const enabled = !adaptation;
          setAdaptation(enabled);
          localStorage.setItem(
            `rac-adaptation:${shopTenant}`,
            enabled ? "1" : "0",
          );
          if (!enabled) {
            setRanked([]);
            setPersonalized(false);
            setViewed({});
            if (cart)
              void shopApi(
                "/store-api/personalization",
                undefined,
                cart.token,
                "DELETE",
              ).catch(() => {});
          }
        }}
      >
        {w(adaptation ? "adaptationOn" : "adaptationOff")}
      </button>
      <button className="shop-bag-button" onClick={() => setBag(true)}>
        <Icon name="box" size={18} />
        {s("bag")}{" "}
        <b>{cart?.lineItems.reduce((n, i) => n + i.quantity, 0) ?? 0}</b>
      </button>
    </header>
  );
}
