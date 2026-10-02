/** Aggregate statistics from PostgreSQL; recorded orders and confirmed money remain visibly separate. */
import { useLocale } from "./i18n";
import { usePlatformText } from "./platform-i18n";
import type { Amount, Overview, ShopDetail } from "./platform-api";
export function Amounts({ amounts }: { amounts: Amount[] }) {
  const t = usePlatformText(),
    { locale } = useLocale();
  const money = (value: string, currency: string) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
      }).format(Number(value));
    } catch {
      return `${value} ${currency}`;
    }
  };
  return (
    <section className="platform-panel">
      <h2>{t("booked")}</h2>
      {amounts.length ? (
        amounts.map((a) => (
          <div className="platform-money" key={a.currency}>
            <strong>{a.currency}</strong>
            <div>
              <small>{t("booked")}</small>
              <b>{money(a.booked, a.currency)}</b>
            </div>
            <div>
              <small>{t("simulated")}</small>
              <b>{money(a.simulated, a.currency)}</b>
            </div>
            <div>
              <small>{t("captured")}</small>
              <b>{money(a.captured, a.currency)}</b>
            </div>
          </div>
        ))
      ) : (
        <p>{t("noMoney")}</p>
      )}
      <p className="platform-note">{t("moneyNote")}</p>
    </section>
  );
}
export default function PlatformDashboard({
  data,
  detail,
}: {
  data: Overview;
  detail?: ShopDetail;
}) {
  const t = usePlatformText(),
    { number } = useLocale();
  if (detail) {
    const max = Math.max(1, ...detail.timeline.map((x) => x.orders));
    return (
      <>
        <h2>{detail.name}</h2>
        <Amounts amounts={detail.amounts} />
        <section className="platform-panel">
          <h2>{t("volume")}</h2>
          <div className="platform-bars" aria-hidden="true">
            {detail.timeline.map((x) => (
              <div
                key={x.day}
                title={`${x.day}: ${x.orders}`}
                style={{ height: `${Math.max(2, (x.orders / max) * 100)}%` }}
              />
            ))}
          </div>
          <details>
            <summary>{t("orders")}</summary>
            <table>
              <thead>
                <tr>
                  <th>{t("created")}</th>
                  <th>{t("orders")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.timeline.map((x) => (
                  <tr key={x.day}>
                    <td>{x.day}</td>
                    <td>{number(x.orders)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </>
    );
  }
  const cards = [
    ["shops", data.shops],
    ["orders", data.orders],
    ["customers", data.customers],
    ["products", data.products],
    ["users", data.merchantUsers],
    ["sandboxes", data.sandboxes],
    ["events", data.pendingEvents],
  ] as const;
  return (
    <>
      <div className="platform-stats">
        {cards.map(([key, value]) => (
          <div key={key}>
            <span>{t(key)}</span>
            <strong>{number(value)}</strong>
          </div>
        ))}
      </div>
      <p className="platform-note">{t("windowNote")}</p>
      <Amounts amounts={data.amounts} />
      <section className="platform-panel">
        <h2>{t("traffic")}</h2>
        <div className="platform-channel-list">
          {data.channels.map((c) => (
            <div key={c.channel}>
              <strong>{c.channel}</strong>
              <b>{number(c.calls)}</b>
              <span>
                {t("failures")}: {number(c.failures)}
              </span>
            </div>
          ))}
        </div>
        <p className="platform-note">{t("trafficNote")}</p>
      </section>
    </>
  );
}
