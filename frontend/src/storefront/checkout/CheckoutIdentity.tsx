/** Inline guest/login/registration step rotates the cart on authentication and refreshes owning defaults. */
import { shopScope } from "../../shared/api/shop-scope";
import { useState } from "react";
import { shopApi, type Cart } from "../../shared/api/shop-api";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
export function customerSessionKey() {
  return `rac-customer:${shopScope()}`;
}
export default function CheckoutIdentity({
  cart,
  onCart,
  onSigned,
}: {
  cart: Cart;
  onCart: (c: Cart) => void;
  onSigned: () => void;
}) {
  const { c } = useCustomerText();
  const { s } = useShopText();
  const { w } = useWorkbenchText();
  const [mode, setMode] = useState<"guest" | "login" | "register">("guest"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="checkout-identity">
      <h3>{c("checkoutContact")}</h3>
      {cart.customerId ? (
        <p className="customer-connected">
          {cart.customerEmail} · {w("account")}
        </p>
      ) : (
        <>
          <div className="customer-actions">
            {(["guest", "login", "register"] as const).map((v) => (
              <button
                type="button"
                className={mode === v ? "shop-primary" : "shop-secondary"}
                key={v}
                onClick={() => setMode(v)}
              >
                {v === "guest"
                  ? c("guestCheckout")
                  : w(v === "login" ? "customerLogin" : "customerRegister")}
              </button>
            ))}
          </div>
          {mode !== "guest" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const f = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  const email = String(f.get("email")),
                    password = String(f.get("password"));
                  if (mode === "register")
                    await shopApi("/store-api/account/register", {
                      email,
                      password,
                      name: `${f.get("firstName")} ${f.get("lastName")}`,
                      firstName: f.get("firstName"),
                      lastName: f.get("lastName"),
                    });
                  const next = await shopApi<Cart & { customerToken: string }>(
                    "/store-api/account/login",
                    { email, password },
                    cart.token,
                  );
                  localStorage.setItem(
                    customerSessionKey(),
                    next.customerToken,
                  );
                  onCart(next);
                  onSigned();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {mode === "register" && (
                <div className="customer-field-grid">
                  {["firstName", "lastName"].map((k) => (
                    <label key={k}>
                      {c(k)}
                      <input
                        name={k}
                        required
                        maxLength={100}
                        autoComplete={
                          k === "firstName" ? "given-name" : "family-name"
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
              <label>
                {c("email")}
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                {s("password")}
                <input
                  name="password"
                  type="password"
                  required
                  minLength={mode === "register" ? 12 : 1}
                  maxLength={128}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                />
              </label>
              <button className="shop-primary" disabled={busy}>
                {w(mode === "register" ? "customerRegister" : "customerLogin")}
              </button>
              {error && <p role="alert">{error}</p>}
            </form>
          )}
        </>
      )}
    </section>
  );
}
