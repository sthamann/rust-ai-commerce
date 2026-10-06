/** Unified affirmative consent: server-validated receipt, channel boundaries, expiry and policy revalidation. */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { shopApi } from "../../shared/api/shop-api";
import {
  consentCurrent,
  consentScope,
  publishConsent,
  useConsent,
} from "../../shared/legal/consent-store";
import {
  purposes,
  type Consent,
  type LegalPolicy,
  type Purpose,
} from "../../shared/legal/legal-types";
import { useLegalText } from "../../shared/i18n/legal-i18n";
import { contentText } from "../../shared/i18n/content-language";
import "../styles/legal.css";
const PolicyContext = createContext<LegalPolicy | undefined>(undefined);
export const useLegalPolicy = () => useContext(PolicyContext);
export default function PrivacyProvider({
  token,
  children,
}: {
  token?: string;
  children: ReactNode;
}) {
  const { l } = useLegalText();
  const scope = consentScope(),
    key = `vendune-consent:${scope}`;
  const [policy, setPolicy] = useState<LegalPolicy>(),
    [open, setOpen] = useState(false),
    [detail, setDetail] = useState(false),
    [choices, setChoices] = useState<Partial<Record<Purpose, boolean>>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const receipt = useConsent();
  const lastReceipt = useRef("");
  const current = useRef(0);
  useEffect(() => {
    let active = true;
    const n = ++current.current;
    publishConsent(undefined, scope);
    lastReceipt.current = "";
    setPolicy(undefined);
    setError("");
    const refresh = async () => {
      try {
        const p = await shopApi<LegalPolicy>("/store-api/legal");
        if (!active || current.current !== n) return;
        setPolicy(p);
        if (!token) return;
        const c = await shopApi<Consent>(
          "/store-api/privacy/consent",
          undefined,
          token,
        );
        if (!active || current.current !== n) return;
        publishConsent(
          consentCurrent(c, p.policyVersion) ? c : undefined,
          scope,
        );
        const signature = JSON.stringify(c);
        if (lastReceipt.current !== signature) {
          lastReceipt.current = signature;
          setChoices(c.decided ? c.choices : {});
          if (!c.decided) setOpen(true);
        }
      } catch (e) {
        if (active) {
          publishConsent(undefined, scope);
          setError((e as Error).message);
        }
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60000);
    const focus = () => void refresh(),
      show = () => {
        setOpen(true);
        setDetail(true);
      };
    window.addEventListener("focus", focus);
    window.addEventListener("storage", focus);
    window.addEventListener("vendune:privacy-open", show);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", focus);
      window.removeEventListener("vendune:privacy-open", show);
      publishConsent(undefined, scope);
    };
  }, [scope, token]);
  const save = async (next: Partial<Record<Purpose, boolean>>) => {
    if (!policy || !token || busy) return;
    setBusy(true);
    setError("");
    try {
      const c = await shopApi<Consent>(
        "/store-api/privacy/consent",
        { policyVersion: policy.policyVersion, choices: next },
        token,
        "PUT",
      );
      publishConsent(c, scope);
      lastReceipt.current = JSON.stringify(c);
      localStorage.setItem(key, JSON.stringify(c));
      setChoices(c.choices);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
      publishConsent(undefined, scope);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (open && policy && token) dialog.current?.showModal();
  }, [open, policy, token]);
  const allowed = purposes.filter((p) => policy?.data.purposes[p]);
  return (
    <PolicyContext.Provider value={policy}>
      {children}
      {open && policy && token && (
        <dialog
          ref={dialog}
          className="privacy-banner"
          aria-label={l("consent")}
          onCancel={(e) => {
            if (receipt.decided) setOpen(false);
            else {
              e.preventDefault();
              void save({});
            }
          }}
        >
          <div className="privacy-heading">
            <div>
              <span className="legal-eyebrow">{l("consent")}</span>
              <h2>{l("choose")}</h2>
            </div>
            {receipt.decided && (
              <button aria-label={l("close")} onClick={() => setOpen(false)}>
                ×
              </button>
            )}
          </div>
          <p>{l("chooseHint")}</p>
          <small>{l("necessaryHint")}</small>
          {detail && (
            <div className="privacy-purposes">
              {allowed.map((p) => (
                <div key={p}>
                  <label>
                    <input
                      type="checkbox"
                      checked={choices[p] === true}
                      disabled={busy}
                      onChange={(e) =>
                        setChoices({ ...choices, [p]: e.target.checked })
                      }
                    />
                    <strong>{l(p)}</strong>
                  </label>
                  {policy.data.services
                    .filter((s) => s.purpose === p)
                    .map((s) => (
                      <small key={s.id}>
                        {s.provider} ·{" "}
                        {contentText(
                          s.description,
                          document.documentElement.lang || policy.mainLocale,
                          policy.mainLocale,
                        )}{" "}
                        · {s.retention}{" "}
                        <a href={s.privacyUrl} target="_blank" rel="noreferrer">
                          {l("privacy")}
                        </a>
                      </small>
                    ))}
                </div>
              ))}
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="privacy-actions">
            <button disabled={busy} onClick={() => void save({})}>
              {l("reject")}
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void save(Object.fromEntries(allowed.map((p) => [p, true])))
              }
            >
              {l("acceptAll")}
            </button>
            {detail ? (
              <button disabled={busy} onClick={() => void save(choices)}>
                {l("save")}
              </button>
            ) : (
              <button disabled={busy} onClick={() => setDetail(true)}>
                {l("customize")}
              </button>
            )}
          </div>
          <a href="#legal/privacy" onClick={() => setOpen(false)}>
            {l("privacy")}
          </a>
        </dialog>
      )}
    </PolicyContext.Provider>
  );
}
