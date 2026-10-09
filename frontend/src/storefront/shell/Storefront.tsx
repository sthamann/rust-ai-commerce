/** Storefront composition root: cart context, routes, customer account and checkout. */
import { CurrencyContext } from "../../shared/i18n/i18n";
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
import PrivacyProvider from "../legal/PrivacyProvider";
import LegalDocument from "../legal/LegalDocument";
import ConsumerRequestForm from "../legal/ConsumerRequestForm";
import { openConsent } from "../../shared/legal/consent-store";
import { useLegalText } from "../../shared/i18n/legal-i18n";
import ShopAnalytics from "../analytics/ShopAnalytics";
import ProductPage from "../catalog/ProductPage";
import { returnToCollection } from "../catalog/product-url";
import OrderCompletion from "../checkout/OrderCompletion";
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
import "../styles/storefront-polish.css";
import "../styles/experience-polish.css";
import ChannelPreview, { channelPreview } from "./ChannelPreview";
export default function Storefront(props: { onMerchant: () => void }) {
  const { co } = useCompanyText();
  const { l } = useLegalText();
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
    <CurrencyContext.Provider value={cart?.price.currency ?? "EUR"}>
      <StorefrontContext.Provider value={c}>
        <PrivacyProvider token={cart?.token}>
          <AppSurfaceProvider
            public
            request={(path, body) => shopApi(path, body, cart?.token)}
            scopeKey={`${shopTenant}:${salesChannel}`}
          >
            <div className="shop">
              <ChannelPreview />
              {!channelPreview() && (
                <ShopAnalytics
                  shop={shopTenant}
                  channel={salesChannel}
                  products={products}
                  cart={cart}
                  bag={bag}
                  order={order}
                />
              )}
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
              {appPath === "#order-confirmed" && order ? (
                <OrderCompletion order={order} onBack={returnToCollection} />
              ) : location.hash.startsWith("#payment/") &&
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
              ) : appPath === "#withdrawal" || appPath === "#privacy-rights" ? (
                <ConsumerRequestForm
                  token={cart?.token}
                  withdrawal={appPath === "#withdrawal"}
                />
              ) : appPath.startsWith("#legal/") ? (
                <LegalDocument kind={appPath.slice(7)} />
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
                <strong>
                  {company.brandName || company.name || shopTenant} /
                </strong>
                <a href="#legal">{co("legalPage")}</a>
                <a href="#legal/privacy">{l("privacy")}</a>
                <a href="#legal/terms">{l("terms")}</a>
                <a href="#legal/accessibility">{l("accessibility")}</a>
                <a href="#withdrawal">{l("withdrawHere")}</a>
                <a href="#privacy-rights">{l("rights")}</a>
                <button onClick={openConsent}>{l("consent")}</button>
                <p>{s("simulation")}</p>
                <a href="https://github.com/sthamann/vendune">GitHub ↗</a>
              </footer>
              {account && !channelPreview() && (
                <CustomerAccount
                  cart={cart}
                  onCart={save}
                  onClose={() => setAccount(false)}
                />
              )}
              {bag && (
                <CheckoutPanel
                  cart={cart}
                  requestError={error}
                  order={order}
                  busy={busy}
                  onClose={() => setBag(false)}
                  onQuantity={quantity}
                  onSelection={selection}
                  onCart={save}
                  preview={channelPreview()}
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
        </PrivacyProvider>
      </StorefrontContext.Provider>
    </CurrencyContext.Provider>
  );
}
