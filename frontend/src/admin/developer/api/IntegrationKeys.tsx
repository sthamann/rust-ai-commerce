/** Personal, expiring, least-privilege integration keys; plaintext stays in component memory and is never reloaded. */
import { useEffect, useState } from "react";
import type { RequestFn } from "../../shell/studio-types";
import ConfirmDialog from "../../../shared/ui/ConfirmDialog";
import { useOperationsText } from "../../../shared/i18n/operations-i18n";
import { useApiText } from "./api-i18n";
type Key = {
  id: string;
  name: string;
  permissions: string[];
  expiresAt: string;
};
export default function IntegrationKeys({ request }: { request: RequestFn }) {
  const t = useApiText();
  const { o } = useOperationsText();
  const [keys, setKeys] = useState<Key[]>([]),
    [access, setAccess] = useState<string[]>([]),
    [name, setName] = useState(""),
    [days, setDays] = useState(30),
    [scopes, setScopes] = useState<string[]>([]),
    [secret, setSecret] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revoke, setRevoke] = useState<Key | null>(null),
    [copied, setCopied] = useState(false);
  const manage = access.includes("team.manage");
  const load = async () =>
    setKeys((await request("/api/workspace/integrations")).elements);
  useEffect(() => {
    let active = true;
    request("/api/auth/access")
      .then(async (v) => {
        if (!active) return;
        setAccess(v.permissions);
        if (v.permissions.includes("team.manage")) {
          const result = await request("/api/workspace/integrations");
          if (active) setKeys(result.elements);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  return (
    <section className="studio-card api-key-panel">
      <h2>{t("keys")}</h2>
      <p>{t("manageHint")}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setSecret("");
          try {
            const result = await request(
              "/api/workspace/integrations",
              { name: name.trim(), expiresInDays: days, permissions: scopes },
              "POST",
            );
            setSecret(result.key);
            setCopied(false);
            setName("");
            setScopes([]);
            await load();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={!manage || busy}>
          <div className="catalog-form-grid">
            <label>
              {t("name")}
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              {t("days")}
              <input
                required
                type="number"
                min={1}
                max={90}
                step={1}
                value={Number.isFinite(days) ? days : ""}
                onChange={(e) => setDays(e.target.valueAsNumber)}
              />
            </label>
          </div>
          <h3>{t("rights")}</h3>
          <div className="api-scope-grid">
            {access
              .filter((p) => p !== "*")
              .map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={scopes.includes(p)}
                    onChange={(e) =>
                      setScopes(
                        e.target.checked
                          ? [...scopes, p]
                          : scopes.filter((v) => v !== p),
                      )
                    }
                  />
                  <span>
                    {o(p)}
                    <small>
                      <code>{p}</code>
                    </small>
                  </span>
                </label>
              ))}
          </div>
          <button
            className="studio-primary"
            disabled={
              !name.trim() ||
              !scopes.length ||
              !Number.isInteger(days) ||
              days < 1 ||
              days > 90
            }
          >
            {t("create")}
          </button>
        </fieldset>
      </form>
      {secret && (
        <div className="api-secret">
          <p>{t("once")}</p>
          <input
            readOnly
            type="password"
            aria-label={t("keys")}
            value={secret}
            autoComplete="off"
          />
          <button
            className="studio-secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {t(copied ? "copied" : "copy")}
          </button>
          <button className="studio-secondary" onClick={() => setSecret("")}>
            {t("clear")}
          </button>
        </div>
      )}
      {keys.map((key) => (
        <article className="api-key-row" key={key.id}>
          <div>
            <strong>{key.name}</strong>
            <p>{key.permissions.join(" · ")}</p>
            <small>
              {t("expiry")}: {new Date(key.expiresAt).toLocaleString()}
              {new Date(key.expiresAt).getTime() <= Date.now()
                ? ` · ${t("expired")}`
                : ""}
            </small>
          </div>
          <button
            className="studio-secondary"
            disabled={!manage || busy}
            onClick={() => setRevoke(key)}
          >
            {t("revoke")}
          </button>
        </article>
      ))}
      {revoke && (
        <ConfirmDialog
          title={t("revoke")}
          confirmLabel={t("revoke")}
          disabled={busy}
          onCancel={() => setRevoke(null)}
          onConfirm={async () => {
            setBusy(true);
            setError("");
            try {
              await request(
                `/api/workspace/integrations/${encodeURIComponent(revoke.id)}`,
                undefined,
                "DELETE",
              );
              setRevoke(null);
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <strong>{revoke.name}</strong>
          <p>{t("revokeHint")}</p>
        </ConfirmDialog>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
