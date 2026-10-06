/** Dedicated login page and blocking reauthentication dialog preserve mounted private editors. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BRAND } from "../../shared/ui/Brand";
import Icon from "../../shared/ui/Icon";
import { useShopText } from "../../shared/i18n/shop-i18n";
import { useConnectedText } from "../../shared/i18n/connected-i18n";
import { locales } from "../../shared/i18n/i18n";
import PersonalAccountForm from "../team/PersonalAccountForm";
import type { useStudioAccess } from "./useStudioAccess";
import "../styles/studio-sign-in.css";
export default function StudioSignIn({
  auth,
  onExit,
  overlay = false,
}: {
  auth: ReturnType<typeof useStudioAccess>;
  onExit: () => void;
  overlay?: boolean;
}) {
  const { s, t, locale, setLocale } = useShopText();
  const { x } = useConnectedText();
  const [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!overlay) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    dialog.current
      ?.querySelector<HTMLInputElement>('input[name="password"]')
      ?.focus();
    return () => {
      previous?.focus();
    };
  }, [overlay]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const content = (
    <section className="studio-auth-card">
      <div className="studio-auth-mark">
        <Icon name="spark" size={26} />
        <strong>{BRAND.name}</strong>
        <span>{t("studio")}</span>
      </div>
      <h1 id="studio-auth-title">
        {overlay ? x("sessionExpiredTitle") : x("studioSignIn")}
      </h1>
      <p id="studio-auth-description">
        {x(overlay ? "resumeEditorHint" : "studioLoginHint")}
      </p>
      {overlay && (
        <div className="studio-auth-identity">
          <Icon name="lock" size={18} />
          <span>{auth.identity?.user.email}</span>
        </div>
      )}
      {!overlay && (
        <div className="account-tabs">
          {["login", "register", "join"].map((m) => (
            <button
              key={m}
              type="button"
              className="studio-secondary"
              aria-pressed={mode === m}
              disabled={busy || auth.checking}
              onClick={() => {
                setMode(m);
                setError("");
              }}
            >
              {s(m)}
            </button>
          ))}
        </div>
      )}
      <PersonalAccountForm
        mode={overlay ? "login" : mode}
        run={run}
        onSession={auth.accept}
        s={s}
        busy={busy || auth.checking}
        email={overlay ? auth.identity?.user.email : undefined}
      />
      {(error || auth.error) && (
        <p role="alert" className="commerce-error">
          {error || auth.error}
        </p>
      )}
      {auth.checking && <p role="status">{x("checkingSession")}</p>}
      {!overlay && auth.error && (
        <button className="studio-secondary" onClick={auth.retry}>
          {t("refresh")}
        </button>
      )}
      <div className="studio-auth-footer">
        <button
          className="studio-secondary"
          type="button"
          onClick={overlay ? auth.logout : onExit}
        >
          {overlay ? x("leaveStudio") : t("storefront")}
        </button>
        {!overlay && (
          <select
            aria-label={t("language")}
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
          >
            {Object.entries(locales).map(([code, name]) => (
              <option value={code} key={code}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>
    </section>
  );
  return overlay ? (
    createPortal(
      <dialog
        ref={dialog}
        className="studio-auth-dialog"
        aria-labelledby="studio-auth-title"
        aria-describedby="studio-auth-description"
        onCancel={(e) => e.preventDefault()}
      >
        {content}
      </dialog>,
      document.body,
    )
  ) : (
    <main className="studio-auth-page">{content}</main>
  );
}
