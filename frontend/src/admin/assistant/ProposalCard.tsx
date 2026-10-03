/** ProposalCard keeps merchant interaction separate from workspace orchestration. */
import { useAppText } from "../../shared/i18n/app-i18n";
import { useLocale } from "../../shared/i18n/i18n";
import Icon from "../../shared/ui/Icon";
import type { Message } from "../shell/studio-types";
export default function ProposalCard({
  message,
  onApply,
  busy,
  canApply,
}: {
  message: Message;
  onApply: () => void;
  busy: boolean;
  canApply: boolean;
}) {
  const { t, money } = useLocale();
  const { a } = useAppText();
  const preview = message.data.preview;
  if (!preview) return null;
  const changes = preview.proposal.changes;
  if (
    !changes.length &&
    !preview.proposal.experience &&
    !preview.proposal.app_action
  )
    return null;
  return (
    <section
      className={`proposal-review ${message.applied ? "is-applied" : ""}`}
    >
      {!canApply && <p>{t("readOnly")}</p>}
      <header>
        <div className="review-status">
          <Icon name={message.applied ? "check" : "pulse"} size={18} />
          <span>{message.applied ? t("applied") : t("pending")}</span>
        </div>
        <span>{changes.length || 1}</span>
      </header>
      {changes.map((c) => {
        const before = preview.catalogBefore.find((p) => p.id === c.product_id);
        return (
          <div className="review-product" key={c.product_id}>
            <b>{before?.name || c.product_id}</b>
            {c.price != null && (
              <div>
                <span>{t("grossPrice")}</span>
                <div className="before-after">
                  <span>
                    <small>{t("before")}</small>
                    {money(before?.price || 0)}
                  </span>
                  <Icon name="arrow" size={16} />
                  <strong>
                    <small>{t("after")}</small>
                    {money(c.price)}
                  </strong>
                </div>
              </div>
            )}
            {c.stock != null && (
              <div>
                <span>{t("stock")}</span>
                <div className="before-after">
                  <span>{before?.stock}</span>
                  <Icon name="arrow" size={16} />
                  <strong>{c.stock}</strong>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {preview.proposal.app_action && (
        <div className="review-product">
          <b>{preview.proposal.app_action.app}</b>
          <p>{preview.proposal.app_action.action}</p>
          {Object.entries(
            JSON.parse(preview.proposal.app_action.arguments_json).fields ?? {},
          ).map(([field, value]) => (
            <p key={field}>
              <span>{a(field)}</span> ·{" "}
              <strong>
                {field === "fee_minor" && typeof value === "number"
                  ? money(value / 100)
                  : String(value)}
              </strong>
            </p>
          ))}
        </div>
      )}
      {preview.proposal.experience && (
        <div className="review-product">
          <b>{t("storefront")}</b>
          <p>
            {preview.proposal.experience.mode === "comparison"
              ? t("comparison")
              : preview.proposal.experience.mode === "discovery"
                ? t("discovery")
                : t("summary")}
          </p>
          <blockquote>{preview.proposal.experience.headline}</blockquote>
        </div>
      )}
      {!message.applied && (
        <footer>
          <span>
            <Icon name="lock" size={14} />
            {t("trust")}
          </span>
          <button
            className="studio-primary"
            disabled={busy || !canApply}
            onClick={onApply}
          >
            {t("approve")}
            <Icon name="check" size={18} />
          </button>
        </footer>
      )}
    </section>
  );
}
