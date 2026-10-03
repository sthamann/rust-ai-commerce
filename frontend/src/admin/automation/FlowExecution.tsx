/** Actual persisted execution traces show branch decisions, confirmed steps and the scheduled continuation. */
import { useAutomationText } from "../../shared/i18n/automation-i18n";
import { useLocale } from "../../shared/i18n/i18n";
export default function FlowExecution({ job }: { job: Record<string, any> }) {
  const { a } = useAutomationText();
  const { date } = useLocale();
  const trace = job.result?.trace ?? job.execution?.trace ?? [];
  return (
    <div className="flow-execution">
      {job.state === "queued" && job.cursor && (
        <p>
          {a("next")}: {job.cursor} · {date(job.availableAt)}
        </p>
      )}
      {trace.length > 0 && (
        <details>
          <summary>
            {trace.length} {a("nodes")}
          </summary>
          <ol>
            {trace.map((step: Record<string, any>, i: number) => (
              <li key={`${step.node}:${i}`}>
                <strong>{step.node}</strong> ·{" "}
                {typeof step.matched === "boolean"
                  ? `${a("operator")}: ${a(step.matched ? "yes" : "no")}`
                  : a(step.action ?? "next")}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
