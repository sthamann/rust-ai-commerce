/** Responsive customer workspace separates authentication, address care and protected purchase details. */
import { useEffect, useRef, useState } from "react";
import type { Cart } from "../../shared/api/shop-api";
import { AppSurfaceSlot } from "../../shared/apps/AppSurfaces";
import AddressBook from "../../shared/customer/AddressBook";
import { useAccountText } from "../../shared/i18n/account-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import "../../shared/styles/customers.css";
import "./account.css";
import type { AccountPage } from "./account-types";
import { useCustomerAccount } from "./useCustomerAccount";
import CustomerSignIn from "./CustomerSignIn";
import AccountOverview from "./AccountOverview";
import AccountProfile, { AccountSecurity } from "./AccountProfile";
import AccountOrderList from "./AccountOrderList";
import AccountOrderDetail from "./AccountOrderDetail";
import AccountDownloads from "./AccountDownloads";
const pages: AccountPage[] = [
  "overview",
  "orders",
  "addresses",
  "downloads",
  "profile",
  "security",
];
export default function CustomerAccount({
  cart,
  onCart,
  onClose,
}: {
  cart?: Cart;
  onCart: (cart: Cart) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    content = useRef<HTMLDivElement>(null);
  const { a } = useAccountText(),
    { c } = useCustomerText();
  const account = useCustomerAccount(cart, onCart);
  const [page, setPage] = useState<AccountPage>("overview"),
    [orderId, setOrderId] = useState<string>();
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    node?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node?.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  useEffect(() => {
    content.current?.scrollTo?.({ top: 0 });
  }, [page, orderId, account.signed]);
  const navigate = (next: AccountPage) => {
    setOrderId(undefined);
    setPage(next);
  };
  const onOrder = (id: string) => {
    setPage("orders");
    setOrderId(id);
  };
  const name =
    account.profile?.profile.firstName ||
    account.profile?.profile.name ||
    account.profile?.email;
  return (
    <dialog
      ref={dialog}
      className={`customer-account ${account.signed ? "is-signed" : "is-auth"}`}
      aria-labelledby="account-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <header className="account-header">
        <div>
          <small>{a("welcome")}</small>
          <h1 id="account-title">{a("title")}</h1>
        </div>
        <button
          className="account-close"
          onClick={onClose}
          aria-label={a("close")}
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div className="account-workspace">
        {account.signed && (
          <aside className="account-sidebar">
            <div className="account-person">
              <span className="account-avatar" aria-hidden="true">
                {name?.slice(0, 1).toUpperCase() ?? "◇"}
              </span>
              <strong>{name}</strong>
              <small>{account.profile?.email}</small>
              <small>
                {c("customerNumber")}: {account.profile?.customerNumber}
              </small>
            </div>
            <nav aria-label={a("title")}>
              {pages.map((next) => (
                <button
                  key={next}
                  aria-current={page === next ? "page" : undefined}
                  disabled={account.busy}
                  onClick={() => navigate(next)}
                >
                  <span>{a(next)}</span>
                  <span aria-hidden="true">{page === next ? "•" : "↗"}</span>
                </button>
              ))}
            </nav>
            <button
              className="account-logout"
              disabled={account.busy}
              onClick={() => void account.logout()}
            >
              {a("logout")}
            </button>
          </aside>
        )}
        <div className="account-content" ref={content}>
          {account.error && (
            <p className="account-feedback is-error" role="alert">
              {account.error}
            </p>
          )}
          {account.feedback && (
            <p className="account-feedback" role="status">
              {account.feedback}
            </p>
          )}
          {!account.signed ? (
            <CustomerSignIn
              cart={cart}
              sessionKey={account.key}
              onCart={onCart}
              setSigned={account.setSigned}
              run={account.run}
              busy={account.busy}
            />
          ) : (
            <>
              {page !== "overview" && !orderId && (
                <div className="account-section-toolbar">
                  <h2>{a(page)}</h2>
                  <button
                    className="shop-secondary"
                    disabled={account.busy || account.loading}
                    onClick={() => void account.run(account.load)}
                  >
                    {a("refresh")}
                  </button>
                </div>
              )}
              {!account.profile && !account.loading && (
                <button
                  className="shop-secondary"
                  disabled={account.busy}
                  onClick={() => void account.run(account.load)}
                >
                  {a("refresh")}
                </button>
              )}
              {account.loading && !account.profile ? (
                <div className="account-loading" role="status">
                  <span className="account-spinner" />
                  {a("loading")}
                </div>
              ) : (
                account.profile && (
                  <>
                    {page === "overview" && (
                      <AccountOverview
                        profile={account.profile}
                        orders={account.orders}
                        downloads={account.downloads.length}
                        onPage={navigate}
                        onOrder={onOrder}
                        onShop={onClose}
                      />
                    )}
                    {page === "profile" && (
                      <AccountProfile
                        profile={account.profile}
                        setProfile={account.setProfile}
                        options={account.options}
                        busy={account.busy}
                        run={account.run}
                        reload={account.load}
                      />
                    )}
                    {page === "security" && (
                      <AccountSecurity
                        sessionKey={account.key}
                        busy={account.busy}
                        run={account.run}
                      />
                    )}
                    {page === "addresses" && (
                      <>
                        <p className="account-muted">{a("addressesHint")}</p>
                        <AddressBook
                          request={account.request}
                          path="/store-api/account/addresses"
                          countries={account.options?.countries ?? []}
                          onChange={() =>
                            void account.load().catch(account.failure)
                          }
                        />
                      </>
                    )}
                    {page === "orders" &&
                      (orderId ? (
                        <AccountOrderDetail
                          key={orderId}
                          id={orderId}
                          onBack={() => setOrderId(undefined)}
                          onOrder={onOrder}
                          downloads={account.downloads}
                          download={account.download}
                          busy={account.busy}
                          run={account.run}
                          onError={account.failure}
                          reload={account.load}
                        />
                      ) : (
                        <>
                          <AccountOrderList
                            orders={account.orders}
                            onSelect={onOrder}
                            onShop={onClose}
                          />
                          {account.nextCursor && (
                            <button
                              className="shop-secondary"
                              disabled={account.busy}
                              onClick={() => void account.moreOrders()}
                            >
                              {a("moreOrders")}
                            </button>
                          )}
                        </>
                      ))}
                    {page === "downloads" && (
                      <AccountDownloads
                        downloads={account.downloads}
                        busy={account.busy}
                        download={account.download}
                        onOrder={onOrder}
                      />
                    )}
                  </>
                )
              )}
              {page === "overview" && (
                <AppSurfaceSlot location="account.overview" />
              )}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
