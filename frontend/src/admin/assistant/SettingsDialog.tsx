/** SettingsDialog keeps merchant interaction separate from workspace orchestration. */
import { useEffect, useRef } from "react";
import { useLocale } from "../../shared/i18n/i18n";
import Icon from "../../shared/ui/Icon";
import type { Provider } from "../shell/studio-types";
export default function SettingsDialog({
  token,
  onToken,
  connected,
  onConnect,
  providers,
  provider,
  model,
  onProvider,
  onModel,
  onClose,
  onIndex,
  busy,
}: {
  token: string;
  onToken: (s: string) => void;
  connected: boolean;
  onConnect: () => void;
  providers: Provider[];
  provider: string;
  model: string;
  onProvider: (s: string) => void;
  onModel: (s: string) => void;
  onClose: () => void;
  onIndex: () => void;
  busy: boolean;
}) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog ref={dialog} className="studio-dialog" onClose={onClose}>
      <div className="dialog-heading">
        <div>
          <span className="kicker">{t("studio")}</span>
          <h2>{t("settings")}</h2>
        </div>
        <button
          className="icon-button"
          aria-label={t("close")}
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <details>
        <summary>{t("token")}</summary>
        <h3>
          <Icon name="lock" size={18} />
          {t("access")}
        </h3>
        <label>
          {t("token")}
          <input
            autoComplete="off"
            type="password"
            value={token}
            onChange={(e) => onToken(e.target.value)}
            placeholder="MERCHANT_TOKEN"
          />
        </label>
        <p>{t("tokenHint")}</p>
        <button
          className="studio-primary"
          disabled={!token || busy}
          onClick={onConnect}
        >
          <Icon name={connected ? "check" : "link"} size={18} />
          {connected ? t("connected") : t("connect")}
        </button>
      </details>
      <section>
        <h3>
          <Icon name="spark" size={18} />
          {t("assistant")}
        </h3>
        <label>
          {t("provider")}
          <select value={provider} onChange={(e) => onProvider(e.target.value)}>
            {(providers.length
              ? providers
              : [
                  {
                    id: "ollama",
                    name: t("local"),
                    model: "",
                    configured: true,
                  },
                ]
            ).map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === "ollama" ? t("local") : p.name}
                {p.configured ? "" : ` · ${t("missingKey")}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("model")}
          <input
            value={model}
            onChange={(e) => onModel(e.target.value)}
            placeholder={t("serverDefault")}
          />
        </label>
        <p>{t("cloudDisclosure")}</p>
        <button
          className="studio-secondary"
          disabled={!connected || busy}
          onClick={onIndex}
        >
          <Icon name="refresh" size={16} />
          {t("index")}
        </button>
      </section>
    </dialog>
  );
}
