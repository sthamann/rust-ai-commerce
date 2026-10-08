/** Relationships use the same typed field.references contract as the form editor; no separate diagram state or database model. */
import type { Manifest } from "../../shared/apps/native/types";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import { useContentLanguage } from "../../shared/i18n/ContentLanguage";
import { contentText } from "../../shared/i18n/content-language";
import { modelWorkspace } from "./model-workspace";
export default function AppModelDiagram({
  manifest,
  onChange,
}: {
  manifest: Manifest;
  onChange: (m: Manifest) => void;
}) {
  const { a } = useAppStudioText(),
    { language, mainLocale } = useContentLanguage();
  return (
    <section className="app-model-diagram">
      <h3>{a("modelDiagram")}</h3>
      <p>{a("modelDiagramHint")}</p>
      <div className="app-model-diagram-cards">
        {manifest.entities.map((e) => (
          <article
            key={e.name}
            onDragOver={(ev) => {
              if (
                ev.dataTransfer.types.includes(
                  "application/vnd.vendune.relation",
                )
              )
                ev.preventDefault();
            }}
            onDrop={(ev) => {
              ev.preventDefault();
              try {
                const source = JSON.parse(
                  ev.dataTransfer.getData("application/vnd.vendune.relation"),
                );
                onChange({
                  ...manifest,
                  entities: manifest.entities.map((old) => ({
                    ...old,
                    fields: old.fields.map((f) =>
                      old.name === source.entity &&
                      f.name === source.field &&
                      ["string", "relations"].includes(f.kind) &&
                      !f.translatable &&
                      !f.coreReference
                        ? { ...f, references: e.name, choices: [] }
                        : f,
                    ),
                  })),
                });
              } catch {
                /* Unknown external drops do not edit the schema. */
              }
            }}
          >
            <h4>{contentText(e.label, language, mainLocale) || e.name}</h4>
            <code>{e.name}</code>
            {e.fields.map((f) => (
              <div
                key={f.name}
                draggable={
                  ["string", "relations"].includes(f.kind) &&
                  !f.translatable &&
                  !f.coreReference
                }
                onDragStart={(ev) =>
                  ev.dataTransfer.setData(
                    "application/vnd.vendune.relation",
                    JSON.stringify({ entity: e.name, field: f.name }),
                  )
                }
              >
                <span>{f.name}</span>
                <small>{f.references ? `→ ${f.references}` : a(f.kind)}</small>
              </div>
            ))}
            <button
              type="button"
              className="studio-secondary"
              disabled={
                (manifest.views?.length ?? 0) >= 8 ||
                (manifest.surfaces?.length ?? 0) >= 12
              }
              onClick={() => onChange(modelWorkspace(manifest, e.name))}
            >
              {a("formWizard")}
            </button>
          </article>
        ))}
      </div>
      <small>{a("formWizardHint")}</small>
    </section>
  );
}
