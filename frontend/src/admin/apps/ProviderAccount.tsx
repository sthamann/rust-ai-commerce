/** Shared installed-provider onboarding and channel connection controls for merchant Apps and App Studio. */
import { useEffect, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import type { CountryCatalogue } from "../../shared/geography/geography-types";
import CountryPicker from "../../shared/geography/CountryPicker";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import { usePaymentProviderText } from "../../shared/i18n/payment-provider-i18n";
export default function ProviderAccount({
  provider,
  request,
  canWrite = true,
}: {
  provider: string;
  request: RequestFn;
  canWrite?: boolean;
}) {
  const t = usePaymentProviderText(),
    [geo, setGeo] = useState<CountryCatalogue>(),
    [channel, setChannel] = useState("default"),
    [environment, setEnvironment] = useState("sandbox"),
    [channels, setChannels] = useState<{ id: string }[]>([]),
    [country, setCountry] = useState(["DE"]),
    [busy, setBusy] = useState(false),
    [confirmDisconnect, setConfirmDisconnect] = useState(false),
    [error, setError] = useState(""),
    [account, setAccount] = useState<{
      ready: boolean;
      onboardingUrl?: string;
    }>();
  useEffect(() => {
    let active = true;
    void request("/store-api/countries")
      .then((v) => {
        if (active) setGeo(v);
      })
      .catch(() => {});
    void request("/api/automation")
      .then((v) => {
        if (active) setChannels(v.channels ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [request]);
  const connect = async (operation: "start" | "status" | "disconnect") => {
    setBusy(true);
    setError("");
    try {
      setAccount(
        await request(`/api/payment-providers/${provider}/onboarding`, {
          operation,
          channel,
          environment,
          country: country[0],
          approve: operation !== "status",
          requestKey: crypto.randomUUID(),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmDisconnect(false);
    }
  };
  return (
    <section className="app-model-card">
      <h2>{t("account")}</h2>
      <label>
        {t("channel")}
        <select
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value);
            setAccount(undefined);
          }}
        >
          {[...new Set(["default", ...channels.map((c) => c.id)])].map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("environment")}
        <select
          value={environment}
          onChange={(e) => {
            setEnvironment(e.target.value);
            setAccount(undefined);
          }}
        >
          <option value="sandbox">{t("sandbox")}</option>
          <option value="live">{t("live")}</option>
        </select>
      </label>
      <CountryPicker
        countries={geo?.countries ?? []}
        value={country}
        single
        label={t("country")}
        onChange={setCountry}
      />
      <div className="workbench-row">
        <button
          disabled={busy || !canWrite}
          className="studio-secondary"
          onClick={() => void connect("status")}
        >
          {t("refresh")}
        </button>
        <button
          disabled={busy || !canWrite}
          className="studio-primary"
          onClick={() => void connect("start")}
        >
          {t("start")}
        </button>
      </div>
      {account && (
        <button
          disabled={busy || !canWrite}
          className="studio-secondary"
          onClick={() => setConfirmDisconnect(true)}
        >
          {t("disconnect")}
        </button>
      )}
      {confirmDisconnect && (
        <ConfirmDialog
          title={t("disconnect")}
          onCancel={() => setConfirmDisconnect(false)}
          onConfirm={() => void connect("disconnect")}
          confirmLabel={t("disconnect")}
          disabled={busy || !canWrite}
        >
          <p>{t("disconnectHint")}</p>
        </ConfirmDialog>
      )}
      {error && <p role="alert">{error}</p>}
      {account && <p>{t(account.ready ? "ready" : "pending")}</p>}
      {account?.onboardingUrl && (
        <a
          className="studio-primary"
          href={account.onboardingUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("continue")}
        </a>
      )}
    </section>
  );
}
