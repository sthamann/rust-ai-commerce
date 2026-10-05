/** Saved version inspection, digest-approved stage install and conflict-aware package-only live release. */
import { contentText } from "../../shared/i18n/content-language";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import type { AppStudio, Build } from "./useAppStudio";
export default function AppVersions({
  studio,
  onEdit,
}: {
  studio: AppStudio;
  onEdit: (build: Build) => void;
}) {
  const { a, locale } = useAppStudioText(),
    { w } = useWorkbenchText();
  return (
    <div className="app-versions">
      <section className="app-model-card">
        <h2>{a("versions")}</h2>
        {!studio.builds.length && <p>{w("noBuilds")}</p>}
        {studio.builds.map((b) => (
          <article className="app-version-row" key={b.id}>
            <div>
              <strong>
                {contentText(b.manifest.name, locale, studio.mainLocale)}
              </strong>
              <span className="soft-tag">{b.version}</span>
              <span>{w(b.state)}</span>
              <code>{b.digest.slice(0, 12)}</code>
            </div>
            <div>
              <button
                className="studio-secondary"
                disabled={studio.busy}
                onClick={() => onEdit(b)}
              >
                {a("edit")}
              </button>
              <button
                className="studio-secondary"
                disabled={studio.busy}
                onClick={() => studio.adopt(b)}
              >
                {w("details")}
              </button>
              {b.state === "draft" && (
                <button
                  className="studio-primary"
                  disabled={studio.busy}
                  onClick={() => void studio.run(() => studio.stage(b))}
                >
                  {w("installStage")}
                </button>
              )}
            </div>
            <details>
              <summary>{w("contract")}</summary>
              <pre>{JSON.stringify(b.manifest, null, 2)}</pre>
            </details>
          </article>
        ))}
      </section>
      <section className="app-model-card">
        <h2>{a("review")}</h2>
        <p>{a("releaseHint")}</p>
        <button
          className="studio-secondary"
          disabled={
            !studio.saved ||
            studio.saved.state !== "staged" ||
            studio.dirty ||
            studio.saved.environment !== studio.env ||
            studio.busy
          }
          onClick={() => void studio.run(studio.review)}
        >
          {w("changes")}
        </button>
        {studio.reviewed && !studio.change && <p>{w("noChanges")}</p>}
        {studio.change && (
          <>
            <p>
              <code>{studio.change.key}</code> ·{" "}
              {studio.change.digest.slice(0, 12)}
            </p>
            {studio.change.conflict && <p role="alert">{w("conflict")}</p>}
            <details>
              <summary>{w("details")}</summary>
              <div className="diff-columns">
                <div>
                  <strong>{w("before")}</strong>
                  <pre>{JSON.stringify(studio.change.before, null, 2)}</pre>
                </div>
                <div>
                  <strong>{w("after")}</strong>
                  <pre>{JSON.stringify(studio.change.after, null, 2)}</pre>
                </div>
              </div>
            </details>
            <button
              className="studio-primary"
              disabled={
                studio.change.conflict ||
                studio.busy ||
                studio.dirty ||
                studio.saved?.environment !== studio.env ||
                studio.change.key !== `app:${studio.manifest.id}`
              }
              onClick={() => void studio.run(studio.publish)}
            >
              {a("publish")}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
