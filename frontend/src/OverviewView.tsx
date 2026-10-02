/** OverviewView renders verified shop state and typed user actions. */
import Icon from "./Icon";
import ProductArt from "./ProductArt";
import { useLocale } from "./i18n";
import type { Overview } from "./studio-types";
export function OverviewView({
  data,
  onIntent,
  onProduct,
}: {
  data: Overview;
  onIntent: (s: string) => void;
  onProduct: (id: string) => void;
}) {
  const { t, money, date, number } = useLocale();
  const low = data.products.filter((p) => p.stock < 10);
  const maximum = Math.max(1, ...data.timeline.map((d) => d.orders));
  return (
    <div className="studio-page">
      <div className="page-intro">
        <span className="kicker">{t("basedOn")}</span>
        <h1>{t("shopPulse")}</h1>
        <p>{t("shopPulseSub")}</p>
      </div>
      <div className="metric-grid">
        <div className="metric">
          <Icon name="pulse" />
          <span>{t("orders")}</span>
          <strong>{number(data.summary.orders)}</strong>
          <small>
            {data.summary.ordersToday} · {t("today")}
          </small>
        </div>
        <div className="metric">
          <Icon name="box" />
          <span>{t("revenue")}</span>
          <strong>{money(data.summary.revenue)}</strong>
          <small>
            {t("simulated")} · {t("lifetime")}
          </small>
        </div>
        <div className="metric">
          <Icon name="graph" />
          <span>{t("products")}</span>
          <strong>{data.products.length}</strong>
          <small>{t("lowStock", { count: low.length })}</small>
        </div>
        <div className="metric">
          <Icon name="chat" />
          <span>{t("pendingPlans")}</span>
          <strong>{data.summary.pendingPlans}</strong>
          <small>{t("assistant")}</small>
        </div>
      </div>
      <div className="overview-columns">
        <section className="studio-card">
          <div className="card-heading">
            <h2>{t("orderTrend")}</h2>
            <span className="soft-tag">{t("simulated")}</span>
          </div>
          <div
            className="order-chart"
            role="img"
            aria-label={data.timeline
              .map((d) => `${d.day}: ${d.orders}`)
              .join(", ")}
          >
            {data.timeline.map((d) => (
              <div className="chart-day" key={d.day}>
                <span>{d.orders}</span>
                <div className="bar-track">
                  <div style={{ height: `${(d.orders / maximum) * 100}%` }} />
                </div>
                <small>
                  {new Intl.DateTimeFormat(data.locale, {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(d.day + "T12:00:00"))}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="studio-card inventory-card">
          <div className="card-heading">
            <h2>{t("inventory")}</h2>
            <span className="soft-tag">{t("api")}</span>
          </div>
          {data.products.map((p) => (
            <button
              className="inventory-row"
              key={p.id}
              onClick={() => onProduct(p.id)}
            >
              <div className="mini-art">
                <ProductArt id={p.id} />
              </div>
              <span>
                {p.name}
                <small>{money(p.price)}</small>
              </span>
              <b className={p.stock < 10 ? "stock-low" : ""}>{p.stock}</b>
              <Icon name="arrow" size={16} />
            </button>
          ))}
        </section>
      </div>
      <section className="studio-card">
        <div className="card-heading">
          <h2>{t("recentOrders")}</h2>
          <span className="soft-tag">{t("simulated")}</span>
        </div>
        {data.orders.length ? (
          <div className="orders-table">
            {data.orders.map((o) => (
              <div className="order-row" key={o.id}>
                <span className="order-icon">
                  <Icon name="box" />
                </span>
                <b>{o.number}</b>
                <span>{date(o.time)}</span>
                <span className="channel-label">
                  {o.channel === "unknown" || !o.channel
                    ? t("unknown")
                    : o.channel.toUpperCase()}
                </span>
                <strong>{money(o.total)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-note">{t("emptyOrders")}</p>
        )}
      </section>
      <div className="overview-columns">
        <section className="studio-card">
          <div className="card-heading">
            <h2>{t("activity")}</h2>
          </div>
          {data.activity.map((a, i) => (
            <div className="activity-row" key={a.id + i}>
              <span className="activity-dot" />
              <div>
                {a.kind === "order"
                  ? t("activityOrder")
                  : a.kind === "approved"
                    ? t("activityApproved")
                    : t("activityProposal")}
                <small>{date(a.time)}</small>
              </div>
            </div>
          ))}
          {!data.activity.length && <p>{t("noActivity")}</p>}
        </section>
        <section className="studio-card next-actions">
          <h2>{t("actions")}</h2>
          <button onClick={() => onIntent(t("askStock"))}>
            <Icon name="box" />
            {t("inventory")}
            <Icon name="arrow" />
          </button>
          <button onClick={() => onIntent(t("learningPrompt"))}>
            <Icon name="pulse" />
            {t("policy")}
            <Icon name="arrow" />
          </button>
          <button onClick={() => onIntent(t("promptRead"))}>
            <Icon name="graph" />
            {t("productKnowledge")}
            <Icon name="arrow" />
          </button>
        </section>
      </div>
    </div>
  );
}
