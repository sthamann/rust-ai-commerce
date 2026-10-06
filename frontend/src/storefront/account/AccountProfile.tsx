/** Focused profile and password forms report persistence and keep account identity outside editable contact data. */
import { useAccountText } from "../../shared/i18n/account-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import { shopApi } from "../../shared/api/shop-api";
import CustomerFields from "../../shared/customer/CustomerFields";
import type {
  AccountProfile as Profile,
  AccountOptions,
} from "./account-types";
export default function AccountProfile({
  profile,
  setProfile,
  options,
  busy,
  run,
  reload,
}: {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  options?: AccountOptions;
  busy: boolean;
  run: (fn: () => Promise<void>, message?: string) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const { a } = useAccountText(),
    { c } = useCustomerText();
  return (
    <section>
      <p className="account-muted">{a("profileHint")}</p>
      <div className="account-identity">
        <strong>{profile.email}</strong>
        <small>{a("emailHint")}</small>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await shopApi(
              "/store-api/account/profile",
              { ...profile.profile, address: null },
              undefined,
              "PUT",
            );
            await reload();
          }, a("saved"));
        }}
      >
        <fieldset disabled={busy}>
          <CustomerFields
            value={profile.profile}
            onChange={(p) => setProfile({ ...profile, profile: p })}
            disabled={busy}
          />
          <label>
            {c("preferredPayment")}
            <select
              value={profile.profile.defaultPaymentMethodId ?? ""}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  profile: {
                    ...profile.profile,
                    defaultPaymentMethodId: e.target.value || null,
                  },
                })
              }
            >
              <option value="">{c("noPreference")}</option>
              {options?.payments.map((payment) => (
                <option key={payment.id} value={payment.id}>
                  {payment.name}
                </option>
              ))}
            </select>
          </label>
          <button className="shop-primary" disabled={busy}>
            {busy ? a("working") : c("save")}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
export function AccountSecurity({
  sessionKey,
  busy,
  run,
}: {
  sessionKey: string;
  busy: boolean;
  run: (fn: () => Promise<void>, message?: string) => Promise<void>;
}) {
  const { a } = useAccountText(),
    { w } = useWorkbenchText();
  return (
    <section className="account-security">
      <p className="account-muted">{a("securityHint")}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            data = new FormData(form);
          void run(async () => {
            const result = await shopApi<{ customerToken: string }>(
              "/store-api/account/password",
              {
                oldPassword: data.get("oldPassword"),
                newPassword: data.get("newPassword"),
              },
            );
            localStorage.setItem(sessionKey, result.customerToken);
            form.reset();
          }, a("passwordSaved"));
        }}
      >
        <fieldset disabled={busy}>
          <label>
            {w("currentPassword")}
            <input
              name="oldPassword"
              type="password"
              required
              autoComplete="current-password"
              maxLength={128}
            />
          </label>
          <label>
            {w("newPassword")}
            <input
              name="newPassword"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              aria-describedby="account-new-password-hint"
            />
          </label>
          <small id="account-new-password-hint">{a("passwordHint")}</small>
          <button className="shop-primary" disabled={busy}>
            {busy ? a("working") : w("changePassword")}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
