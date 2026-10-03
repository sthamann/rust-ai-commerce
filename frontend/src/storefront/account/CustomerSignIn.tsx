/** CustomerSignIn: focused form view with explicit typed inputs and callbacks. */
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";

import { shopApi, type Cart } from "../../shared/api/shop-api";
import "../../shared/styles/customers.css";
export type CustomerSignInProps = {
  run: (fn: () => Promise<void>) => Promise<void>;
  register: boolean;
  cart: import("../../shared/api/shop-api").Cart | undefined;
  key: string;
  onCart: (c: import("../../shared/api/shop-api").Cart) => void;
  setSigned: React.Dispatch<React.SetStateAction<boolean>>;
  w: ReturnType<typeof useWorkbenchText>["w"];
  c: ReturnType<typeof useCustomerText>["c"];
  s: ReturnType<typeof useShopText>["s"];
  busy: boolean;
  setRegister: React.Dispatch<React.SetStateAction<boolean>>;
};
export default function CustomerSignIn({
  run,
  register,
  cart,
  key,
  onCart,
  setSigned,
  w,
  c,
  s,
  busy,
  setRegister,
}: CustomerSignInProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(async () => {
          const email = String(f.get("email")),
            password = String(f.get("password"));
          if (register)
            await shopApi("/store-api/account/register", {
              name: `${f.get("firstName")} ${f.get("lastName")}`,
              firstName: f.get("firstName"),
              lastName: f.get("lastName"),
              email,
              password,
            });
          const result = await shopApi<Cart & { customerToken: string }>(
            "/store-api/account/login",
            { email, password },
            cart?.token,
          );
          localStorage.setItem(key, result.customerToken);
          onCart(result);
          setSigned(true);
        });
      }}
    >
      <h3>{w(register ? "customerRegister" : "customerLogin")}</h3>
      {register && (
        <div className="customer-field-grid">
          {["firstName", "lastName"].map((k) => (
            <label key={k}>
              {c(k)}
              <input
                name={k}
                required
                maxLength={100}
                autoComplete={k === "firstName" ? "given-name" : "family-name"}
              />
            </label>
          ))}
        </div>
      )}
      <label>
        {s("email")}
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        {s("password")}
        <input
          name="password"
          type="password"
          required
          minLength={register ? 12 : 1}
          maxLength={128}
          autoComplete={register ? "new-password" : "current-password"}
        />
      </label>
      <button className="shop-primary" disabled={busy || !cart}>
        {w(register ? "customerRegister" : "customerLogin")}
      </button>
      <button
        className="shop-secondary"
        type="button"
        onClick={() => setRegister(!register)}
      >
        {w(register ? "customerLogin" : "customerRegister")}
      </button>
    </form>
  );
}
