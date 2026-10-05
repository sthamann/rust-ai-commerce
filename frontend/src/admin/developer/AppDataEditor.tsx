/** Managed app models expose typed fields and opt-in public reads; removal cleans dependent bindings. */
import LocalizedField from "../../shared/i18n/LocalizedField";
import { useAppStudioText, appText } from "../../shared/i18n/app-studio-i18n";
import type { Entity, Field, Manifest } from "../../shared/apps/native/types";
import Icon from "../../shared/ui/Icon";
import { nextId, removeEntity, renameEntity, textMap } from "./app-model";
export default function AppDataEditor({
  manifest,
  onChange,
}: {
  manifest: Manifest;
  onChange: (m: Manifest) => void;
}) {
  const { a } = useAppStudioText();
  const patch = (name: string, next: Entity) =>
    onChange({
      ...manifest,
      entities: manifest.entities.map((e) => (e.name === name ? next : e)),
    });
  return (
    <div className="app-data-editor">
      <div className="app-section-top">
        <div>
          <h2>{a("data")}</h2>
          <p>{a("privateHint")}</p>
        </div>
        <button
          className="studio-primary"
          disabled={manifest.entities.length >= 12}
          onClick={() =>
            onChange({
              ...manifest,
              entities: [
                ...manifest.entities,
                {
                  name: nextId(
                    "model",
                    manifest.entities.map((e) => e.name),
                  ),
                  label: appText("entity"),
                  publicRead: false,
                  fields: [
                    {
                      name: "title",
                      label: appText("title"),
                      kind: "string",
                      required: true,
                      translatable: true,
                    },
                  ],
                },
              ],
            })
          }
        >
          <Icon name="plus" size={16} />
          {a("addEntity")}
        </button>
      </div>
      {manifest.entities.map((entity, entityIndex) => (
        <section className="app-model-card" key={entityIndex}>
          <header>
            <span className="app-model-id">
              <Icon name="box" />
              {entity.name}
            </span>
            <span>{entity.fields.length} / 16</span>
            <button
              className="app-icon-button"
              aria-label={a("delete")}
              onClick={() => onChange(removeEntity(manifest, entity.name))}
            >
              <Icon name="close" size={16} />
            </button>
          </header>
          <div className="app-model-meta">
            <label>
              {a("id")}
              <input
                value={entity.name}
                maxLength={27}
                onChange={(e) =>
                  onChange(renameEntity(manifest, entity.name, e.target.value))
                }
              />
            </label>
            <LocalizedField
              label={a("entity")}
              value={entity.label}
              onChange={(v) =>
                patch(entity.name, { ...entity, label: textMap(v) })
              }
              required
              maxLength={100}
            />
            <label className="app-check">
              <input
                type="checkbox"
                checked={entity.publicRead}
                onChange={(e) =>
                  patch(entity.name, {
                    ...entity,
                    publicRead: e.target.checked,
                  })
                }
              />
              {a("public")}
            </label>
          </div>
          <div className="app-field-list">
            {entity.fields.map((field, index) => {
              const set = (f: Partial<Field>) =>
                patch(entity.name, {
                  ...entity,
                  fields: entity.fields.map((n, i) =>
                    i === index ? { ...n, ...f } : n,
                  ),
                });
              return (
                <div className="app-field-row" key={index}>
                  <label>
                    {a("id")}
                    <input
                      value={field.name}
                      maxLength={32}
                      onChange={(e) => set({ name: e.target.value })}
                    />
                  </label>
                  <LocalizedField
                    label={a("field")}
                    value={field.label}
                    onChange={(v) => set({ label: textMap(v) })}
                    required
                    maxLength={100}
                  />
                  <label>
                    {a("type")}
                    <select
                      value={field.kind}
                      onChange={(e) =>
                        set({
                          kind: e.target.value as Field["kind"],
                          translatable: false,
                          indexed: false,
                        })
                      }
                    >
                      {(["string", "integer", "boolean", "json"] as const).map(
                        (k) => (
                          <option key={k} value={k}>
                            {a(k)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <div className="app-field-flags">
                    {(["required", "translatable", "indexed"] as const).map(
                      (key) => (
                        <label key={key} className="app-check">
                          <input
                            type="checkbox"
                            disabled={
                              (key === "translatable" &&
                                field.kind !== "string") ||
                              (key === "indexed" &&
                                (field.kind === "json" || field.translatable))
                            }
                            checked={field[key] ?? false}
                            onChange={(e) =>
                              set({
                                [key]: e.target.checked,
                                ...(key === "translatable" && e.target.checked
                                  ? { indexed: false }
                                  : {}),
                              })
                            }
                          />
                          {a(key === "translatable" ? "translated" : key)}
                        </label>
                      ),
                    )}
                  </div>
                  <button
                    className="app-icon-button"
                    aria-label={a("delete")}
                    disabled={entity.fields.length === 1}
                    onClick={() =>
                      patch(entity.name, {
                        ...entity,
                        fields: entity.fields.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            className="studio-secondary"
            disabled={entity.fields.length >= 16}
            onClick={() =>
              patch(entity.name, {
                ...entity,
                fields: [
                  ...entity.fields,
                  {
                    name: nextId(
                      "field",
                      entity.fields.map((f) => f.name),
                    ),
                    label: appText("field"),
                    kind: "string",
                    required: false,
                  },
                ],
              })
            }
          >
            <Icon name="plus" size={15} />
            {a("addField")}
          </button>
        </section>
      ))}
    </div>
  );
}
