/** Metadata-only credentials screen; rotation sends plaintext once to the encrypted server store. */
import { useEffect, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import { useAppAccessText } from "../../shared/i18n/app-access-i18n";
type Kind = "service" | "webhook" | "outbound";
type Secrets = {
  digest: string;
  kinds: Kind[];
  canManage: boolean;
  encryptionReady: boolean;
  secrets: {
    kind: Kind;
    revision: number;
    rotatedAt: string;
    packageDigest: string;
  }[];
};
export default function AppSecrets({
  app,
  request,
}: {
  app: string;
  request: RequestFn;
}) {
  const t = useAppAccessText();
  const [data, setData] = useState<Secrets | null>(null),
    [kind, setKind] = useState<Kind>("service"),
    [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null);
    setSecret("");
    setError("");
    setNotice(false);
    setConfirm(false);
    request(`/api/apps/${app}/secrets`)
      .then((v) => {
        if (active) {
          setData(v);
          setKind(v.kinds[0] ?? "service");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [app, request]);
  const rotate = async () => {
    if (!data) return;
    setBusy(true);
    setError("");
    setNotice(false);
    try {
      await request(
        `/api/apps/${app}/secrets/${kind}`,
        {
          approve: true,
          digest: data.digest,
          revision: data.secrets.find((s) => s.kind === kind)?.revision ?? 0,
          secret,
        },
        "PUT",
      );
      setSecret("");
      setConfirm(false);
      setData(await request(`/api/apps/${app}/secrets`));
      setNotice(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (data && !data.kinds.length) return null;
  return (
    <section className="app-contract-summary">
      <h3>{t("secretTitle")}</h3>
      <p>{t("secretHint")}</p>
      {data && !data.encryptionReady && (
        <p role="alert">{t("encryptedUnavailable")}</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setConfirm(true);
        }}
      >
        <fieldset
          disabled={busy || !data?.canManage || !data?.encryptionReady}
          className="app-access-permissions"
        >
          <label>
            {t("secretTitle")}
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Kind);
                setSecret("");
                setNotice(false);
              }}
            >
              {data?.kinds.map((k) => (
                <option key={k} value={k}>
                  {t(k)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("secretValue")}
            <input
              type="password"
              autoComplete="new-password"
              value={secret}
              minLength={32}
              maxLength={4096}
              required
              onChange={(e) => setSecret(e.target.value)}
            />
          </label>
          <button className="studio-primary" disabled={secret.length < 32}>
            {t("rotate")}
          </button>
        </fieldset>
      </form>
      {data?.secrets.map((s) => (
        <div className="app-access-key" key={s.kind}>
          <strong>{t(s.kind)}</strong>
          <code>v{s.revision}</code>
          <time dateTime={s.rotatedAt}>
            {new Date(s.rotatedAt).toLocaleString()}
          </time>
          {s.packageDigest !== data.digest && <small>{t("expired")}</small>}
        </div>
      ))}
      {notice && <p role="status">{t("rotated")}</p>}
      {error && <p role="alert">{error}</p>}
      {confirm && (
        <ConfirmDialog
          title={t("rotate")}
          confirmLabel={t("rotate")}
          disabled={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void rotate()}
        >
          <p>{t("rotateHint")}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
