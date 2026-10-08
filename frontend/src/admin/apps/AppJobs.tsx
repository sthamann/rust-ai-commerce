/** Long actions use the same app/outbox contract, with progress and explicit uncertain-outcome review. */
import { useEffect, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import AppJobArtifact from "./AppJobArtifact";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import { contentText } from "../../shared/i18n/content-language";
import { useContentLanguage } from "../../shared/i18n/ContentLanguage";
import { useAppOperationsText } from "../../shared/i18n/app-operations-i18n";
type Job = {
  id: string;
  action: string;
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "uncertain"
    | "cancel_requested"
    | "cancelled";
  progress: number;
  message: Record<string, string>;
  revision: number;
  result: unknown;
};
export default function AppJobs({
  app,
  request,
}: {
  app: string;
  request: RequestFn;
}) {
  const t = useAppOperationsText(),
    { language, mainLocale } = useContentLanguage();
  const [jobs, setJobs] = useState<Job[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<{ job: Job; operation: string } | null>(
      null,
    );
  const refresh = async () => {
    try {
      setJobs((await request(`/api/apps/${app}/jobs`)).jobs);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    let active = true;
    const read = () =>
      request(`/api/apps/${app}/jobs`)
        .then((v) => {
          if (active) setJobs(v.jobs);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void read();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [app, request]);
  return (
    <section className="app-contract-summary">
      <header className="app-detail-heading">
        <h3>{t("jobs")}</h3>
        <button
          className="studio-secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {t("refresh")}
        </button>
      </header>
      <p>{t("jobHint")}</p>
      {jobs.map((j) => (
        <article key={j.id} className="app-job">
          <strong>{j.action}</strong> · {t(j.status)}
          <progress max={100} value={j.progress} />
          <p>{contentText(j.message, language, mainLocale)}</p>
          <div className="app-actions">
            {(["queued", "running"].includes(j.status)
              ? ["cancel"]
              : ["failed", "uncertain"].includes(j.status)
                ? [
                    "retry",
                    ...(j.status === "uncertain"
                      ? ["resolve_cancelled"]
                      : ["archive"]),
                  ]
                : ["succeeded", "cancelled"].includes(j.status)
                  ? ["archive"]
                  : []
            ).map((op) => (
              <button
                key={op}
                className="studio-secondary"
                disabled={busy}
                onClick={() => setSelected({ job: j, operation: op })}
              >
                {t(op as "cancel" | "retry" | "archive" | "resolve_cancelled")}
              </button>
            ))}
          </div>
          {j.status === "succeeded" && (
            <AppJobArtifact app={app} result={j.result} request={request} />
          )}
          {j.result != null && (
            <details>
              <summary>{t("result")}</summary>
              <pre>{JSON.stringify(j.result, null, 2)}</pre>
            </details>
          )}
        </article>
      ))}
      {!jobs.length && <p>{t("empty")}</p>}
      {error && <p role="alert">{error}</p>}
      {selected && (
        <ConfirmDialog
          title={t("jobs")}
          confirmLabel={t(selected.operation as "cancel")}
          disabled={busy}
          onCancel={() => setSelected(null)}
          onConfirm={() => {
            setBusy(true);
            void request(`/api/apps/${app}/jobs/${selected.job.id}`, {
              operation: selected.operation,
              revision: selected.job.revision,
              approveUnknownOutcome: true,
            })
              .then(() => {
                setSelected(null);
                return refresh();
              })
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          <p>
            {t(
              selected.operation === "retry" ||
                selected.operation === "resolve_cancelled"
                ? "jobUnknown"
                : "jobConfirm",
            )}
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
