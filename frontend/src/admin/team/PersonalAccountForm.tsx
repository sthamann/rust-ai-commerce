/** PersonalAccountForm: focused account-form view with explicit typed inputs and callbacks. */
import { useShopText } from "../../shared/i18n/shop-i18n";
import type { Session } from "./UsersManager";

import { shopApi } from "../../shared/api/shop-api";
import "../styles/commerce-manager.css";
export type PersonalAccountFormProps = {
  run: (fn: () => Promise<void>) => Promise<void>;
  mode: string;
  onSession: (s: import("./UsersManager").Session) => void | Promise<void>;
  s: ReturnType<typeof useShopText>["s"];
  busy: boolean;
  email?: string;
};
export default function PersonalAccountForm({
  run,
  mode,
  onSession,
  s,
  busy,
  email,
}: PersonalAccountFormProps) {
  return (
    <form
      className="account-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const body = Object.fromEntries(form);
        run(async () => {
          const session = await shopApi<Session>(
            `/api/auth/${mode === "join" ? "accept" : mode}`,
            body,
          );
          await onSession(session);
        });
      }}
    >
      {mode !== "join" && (
        <label>
          {s("email")}
          <input
            defaultValue={email}
            readOnly={!!email}
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
      )}
      {mode !== "login" && (
        <label>
          {s("accountName")}
          <input name="name" autoComplete="name" required maxLength={100} />
        </label>
      )}
      <label>
        {s("password")}
        <input
          type="password"
          name="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      {mode === "register" && (
        <>
          <label>
            {s("workspaceName")}
            <input name="workspaceName" required maxLength={100} />
          </label>
          <label>
            {s("workspaceId")}
            <input
              name="workspaceId"
              required
              minLength={2}
              maxLength={48}
              pattern="[a-z0-9][a-z0-9\-]+"
              placeholder={s("shopSlugExample")}
            />
          </label>
        </>
      )}
      {mode === "join" && (
        <label>
          {s("invitationToken")}
          <input
            name="invitationToken"
            required
            minLength={64}
            maxLength={64}
            autoComplete="off"
          />
        </label>
      )}
      <button className="studio-primary" disabled={busy}>
        {s(mode)}
      </button>
    </form>
  );
}
