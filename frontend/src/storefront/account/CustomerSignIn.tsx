/** Distinct sign-in and registration forms with correct autofill and an authenticated, rotated cart context. */
import { useState } from "react";
import { shopApi, type Cart } from "../../shared/api/shop-api";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useAccountText } from "../../shared/i18n/account-i18n";
export default function CustomerSignIn({
  cart,
  sessionKey,
  onCart,
  setSigned,
  run,
  busy,
}: {
  cart?: Cart;
  sessionKey: string;
  onCart: (cart: Cart) => void;
  setSigned: (signed: boolean) => void;
  run: (fn: () => Promise<void>) => Promise<void>;
  busy: boolean;
}) {
  const { a } = useAccountText(),
    { c } = useCustomerText();
  const [register, setRegister] = useState(false),
    [visible, setVisible] = useState(false);
  return (
    <div className="account-auth">
      <nav className="account-auth-tabs" aria-label={a("title")}>
        <button
          type="button"
          aria-current={!register ? "page" : undefined}
          disabled={busy}
          onClick={() => setRegister(false)}
        >
          {a("signIn")}
        </button>
        <button
          type="button"
          aria-current={register ? "page" : undefined}
          disabled={busy}
          onClick={() => setRegister(true)}
        >
          {a("register")}
        </button>
      </nav>
      <h2>{a(register ? "register" : "signIn")}</h2>
      <p>{a(register ? "registerHint" : "signInHint")}</p>
      <form
        key={String(register)}
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void run(async () => {
            const email = String(form.get("email")),
              password = String(form.get("password"));
            if (register)
              await shopApi("/store-api/account/register", {
                name: `${form.get("firstName")} ${form.get("lastName")}`,
                firstName: form.get("firstName"),
                lastName: form.get("lastName"),
                email,
                password,
              });
            const context =
              cart?.status === "open"
                ? cart
                : await shopApi<Cart>("/store-api/checkout/cart", {});
            const result = await shopApi<Cart & { customerToken: string }>(
              "/store-api/account/login",
              { email, password },
              context.token,
            );
            localStorage.setItem(sessionKey, result.customerToken);
            onCart(result);
            setSigned(true);
          });
        }}
      >
        <fieldset disabled={busy}>
          {register && (
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
              maxLength={254}
            />
          </label>
          <label>
            {a("password")}
            <span className="account-password">
              <input
                name="password"
                aria-label={a("password")}
                type={visible ? "text" : "password"}
                required
                minLength={register ? 12 : 1}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
                aria-describedby={
                  register ? "account-password-hint" : undefined
                }
              />
              <button
                type="button"
                className="account-reveal"
                aria-label={a(visible ? "hidePassword" : "showPassword")}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                <span aria-hidden="true">{visible ? "◉" : "◎"}</span>
              </button>
            </span>
          </label>
          {register && (
            <small id="account-password-hint">{a("passwordHint")}</small>
          )}
          <button className="shop-primary account-submit" disabled={busy}>
            {a(busy ? "working" : register ? "register" : "signIn")}
            <span aria-hidden="true"> →</span>
          </button>
        </fieldset>
      </form>
    </div>
  );
}
