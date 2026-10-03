/** Server-owned transitions: one source for permitted actions, labels and business guards. */
import { useOperationsText } from "../../shared/i18n/operations-i18n";
export type OrderAction = {
  id: string;
  kind: string;
  state: string;
  from: string;
  label?: Record<string, string>;
  enabled: boolean;
  reason?: string;
  deliveryIndex?: number;
};
export default function OrderWorkflow({
  order,
  busy,
  canEdit,
  onAction,
}: {
  order: any;
  busy: boolean;
  canEdit: boolean;
  onAction: (action: OrderAction) => void;
}) {
  const { o, locale } = useOperationsText();
  const workflow = order.workflow;
  const state = workflow?.states.find((s: any) => s.id === order.state);
  const actions = (workflow?.actions ?? []).filter(
    (a: OrderAction) => a.kind === "order",
  ) as OrderAction[];
  const title = (label?: Record<string, string>, fallback = "") =>
    label?.[locale.slice(0, 2)] ?? o(fallback);
  return (
    <section className="order-workflow studio-card">
      <div className="workflow-current">
        <small>{o("currentStatus")}</small>
        <h2>
          <span className="status-orbit" />
          {title(state?.label, order.state)}
        </h2>
        <p>{o("workflowHint")}</p>
      </div>
      <div className="workflow-next">
        <small>{o("nextStep")}</small>
        {actions.length ? (
          actions.map((action) => (
            <div className="workflow-choice" key={action.id}>
              <button
                className={
                  action.state === "cancelled"
                    ? "workflow-cancel"
                    : "studio-primary"
                }
                disabled={busy || !canEdit || !action.enabled}
                onClick={() => onAction(action)}
              >
                {title(action.label, action.state)}{" "}
                <span aria-hidden="true">→</span>
              </button>
              {action.reason && <small>{o(action.reason)}</small>}
            </div>
          ))
        ) : (
          <p>{o("noNextStep")}</p>
        )}
      </div>
    </section>
  );
}
