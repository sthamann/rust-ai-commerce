/** EmailProviderFields: focused connector-settings view with explicit typed inputs and callbacks. */
import { useEmailText } from "../../shared/i18n/email-i18n";
import { languages } from "./email-languages";

export type EmailProviderFieldsProps = {
  e: ReturnType<typeof useEmailText>["e"];
  manage: boolean;
  busy: boolean;
  settings: any;
  change: (key: string, value: unknown) => void;
  field: (key: string, type?: string) => React.JSX.Element;
  secret: (key: string) => React.JSX.Element;
};
export default function EmailProviderFields({
  e,
  manage,
  busy,
  settings,
  change,
  field,
  secret,
}: EmailProviderFieldsProps) {
  return (
    <div className="connector-settings">
      <label>
        {e("provider")}
        <select
          disabled={!manage || busy}
          value={settings.provider}
          onChange={(ev) => change("provider", ev.target.value)}
        >
          <option value="smtp">SMTP</option>
          <option value="resend">Resend</option>
          <option value="sendgrid">SendGrid</option>
        </select>
      </label>
      {field("fromEmail", "email")}
      {field("fromName")}
      {field("replyTo", "email")}
      {settings.provider === "smtp" ? (
        <>
          {field("smtpHost")}
          {field("smtpPort", "number")}
          <label>
            {e("smtpSecurity")}
            <select
              disabled={!manage || busy}
              value={settings.smtpSecurity}
              onChange={(ev) => change("smtpSecurity", ev.target.value)}
            >
              <option value="starttls">STARTTLS · 587</option>
              <option value="tls">TLS · 465</option>
            </select>
          </label>
          {field("smtpUsername")}
          {secret("smtpPassword")}
          <p>{e("approval")}</p>
        </>
      ) : (
        <>
          {secret("apiKey")}
          {settings.provider === "sendgrid" && (
            <label>
              {e("region")}
              <select
                disabled={!manage || busy}
                value={settings.region}
                onChange={(ev) => change("region", ev.target.value)}
              >
                <option value="global">{e("global")}</option>
                <option value="eu">{e("eu")}</option>
              </select>
            </label>
          )}
        </>
      )}
      <p>{e("secrets")}</p>
      {["enabled", "dryRun", "notifyOrders"].map((key) => (
        <label className="checkbox-label" key={key}>
          <input
            type="checkbox"
            disabled={!manage || busy}
            checked={settings[key]}
            onChange={(ev) => change(key, ev.target.checked)}
          />
          {e(key === "notifyOrders" ? "automatic" : key)}
        </label>
      ))}
      <label>
        {e("locale")}
        <select
          disabled={!manage || busy}
          value={settings.locale}
          onChange={(ev) => change("locale", ev.target.value)}
        >
          {Object.entries(languages).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
