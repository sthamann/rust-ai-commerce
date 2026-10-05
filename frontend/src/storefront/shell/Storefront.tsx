/** Storefront composition root: cart context, routes, customer account and checkout. */
import { shopApi, type Cart } from "../../shared/api/shop-api";
import {
  AppSurfaceProvider,
  AppSurfaceSlot,
  StorefrontAppPage,
} from "../../shared/apps/AppSurfaces";
import "../../shared/styles/apps.css";
import "../../shared/styles/workbench.css";
import Icon from "../../shared/ui/Icon";
import CustomerAccount from "../account/CustomerAccount";
import ShopAnalytics from "../analytics/ShopAnalytics";
import ProductPage from "../catalog/ProductPage";
import CheckoutPanel from "../checkout/CheckoutPanel";
import PaymentSession from "../checkout/PaymentSession";
import "../styles/shop.css";

import { StorefrontContext } from "./StorefrontContext";
import CompanyLegalPage from "./CompanyLegalPage";
import { useCompanyText } from "../../shared/i18n/company-i18n";
import "../styles/company-identity.css";
import StorefrontHeader from "./StorefrontHeader";
import StorefrontHome from "./StorefrontHome";
import { useStorefrontController } from "./useStorefrontController";
export default function Storefront(props: { onMerchant: () => void }) {
  const { co } = useCompanyText();
  const c = useStorefrontController(props);
  const {
    company,
    cart,
    shopTenant,
    salesChannel,
    products,
    bag,
    order,
    w,
    error,
    s,
    setError,
    id,
    appPath,
    busy,
    add,
    save,
    account,
    setAccount,
    setBag,
    quantity,
    selection,
    buy,
  } = c;
  return (
    <StorefrontContext.Provider value={c}>
      <AppSurfaceProvider
        public
        request={(path, body) => shopApi(path, body, cart?.token)}
        scopeKey={`${shopTenant}:${salesChannel}`}
      >
        <div className="shop">
          <ShopAnalytics
            shop={shopTenant}
            channel={salesChannel}
            products={products}
            cart={cart}
            bag={bag}
            order={order}
          />
          {new URLSearchParams(location.search).get("sandbox") === "1" && (
            <div className="sandbox-banner">
              {w("stage")} · {w("exclusion")}
            </div>
          )}
          <StorefrontHeader />
          <AppSurfaceSlot
            location="storefront.header"
            context={{ salesChannel }}
          />
          {error && (
            <div role="alert" className="shop-error">
              {error}
              <button aria-label={s("close")} onClick={() => setError("")}>
                <Icon name="close" />
              </button>
            </div>
          )}
          {location.hash.startsWith("#payment/") &&
          localStorage.getItem(
            `rac-payment-token:${location.hash.slice(9)}`,
          ) ? (
            <main className="shop-content">
              <PaymentSession
                id={location.hash.slice(9)}
                token={localStorage.getItem(
                  `rac-payment-token:${location.hash.slice(9)}`,
                )!}
              />
            </main>
          ) : appPath.startsWith("#app/") ? (
            <StorefrontAppPage path={appPath} />
          ) : appPath === "#legal" ? (
            <CompanyLegalPage />
          ) : id ? (
            <ProductPage
              id={id}
              cart={cart}
              busy={busy}
              onAdd={add}
              onCart={save}
            />
          ) : (
            <StorefrontHome />
          )}
          <footer className="shop-footer">
            <strong>{company.brandName || company.name || shopTenant} /</strong>
            <a href="#legal">{co("legalPage")}</a>
            <p>{s("simulation")}</p>
            <a href="https://github.com/sthamann/vendune">GitHub ↗</a>
          </footer>
          {account && (
            <CustomerAccount
              cart={cart}
              onCart={save}
              onClose={() => setAccount(false)}
            />
          )}
          {bag && (
            <CheckoutPanel
              cart={cart}
              order={order}
              busy={busy}
              onClose={() => setBag(false)}
              onQuantity={quantity}
              onSelection={selection}
              onCart={save}
              onBuy={buy}
              onCoupons={async (codes) => {
                const result = await shopApi<Cart>(
                  "/store-api/checkout/coupons",
                  { codes, revision: cart?.revision },
                  cart?.token,
                  "PUT",
                );
                save(result);
              }}
            />
          )}
        </div>
      </AppSurfaceProvider>
    </StorefrontContext.Provider>
  );
}
