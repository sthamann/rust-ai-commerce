/** Optional graph mappings edit the canonical manifest; native authorized record lists own the projection. */
import type { Manifest } from "../../shared/apps/native/types";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import { useContentLanguage } from "../../shared/i18n/ContentLanguage";
import LocalizedField from "../../shared/i18n/LocalizedField";
import Icon from "../../shared/ui/Icon";
type Mapping = NonNullable<
  NonNullable<Manifest["intelligence"]>["ontology"]
>[number];
export default function AppOntology({
  manifest,
  onChange,
}: {
  manifest: Manifest;
  onChange: (m: Manifest) => void;
}) {
  const { a } = useAppStudioText();
  const { mainLocale } = useContentLanguage();
  const ai = manifest.intelligence ?? {
    description: manifest.name,
    entities: [],
    tools: [],
  };
  const mappings = ai.ontology ?? [];
  function set(entity: string, next?: Mapping) {
    onChange({
      ...manifest,
      intelligence: {
        ...ai,
        ontology: [
          ...mappings.filter((n) => n.entity !== entity),
          ...(next ? [next] : []),
        ],
      },
    });
  }
  return (
    <section className="app-model-card">
      <header>
        <Icon name="graph" />
        <h2>{a("ontology")}</h2>
      </header>
      <p className="hint">{a("ontologyHint")}</p>
      {manifest.entities.map((entity) => {
        const node = mappings.find((n) => n.entity === entity.name);
        const available =
          ai.entities.includes(entity.name) &&
          manifest.permissions.includes("data.read") &&
          manifest.actions?.some(
            (action) =>
              action.handler === "list" && action.entity === entity.name,
          );
        return (
          <div className="app-model-card" key={entity.name}>
            <header>
              <code>{entity.name}</code>
              <label className="app-check">
                <input
                  type="checkbox"
                  checked={!!node}
                  disabled={!node && (!available || mappings.length >= 4)}
                  onChange={(event) =>
                    set(
                      entity.name,
                      event.target.checked
                        ? {
                            entity: entity.name,
                            nodeType: entity.name,
                            label: Object.keys(entity.label ?? {}).length
                              ? entity.label!
                              : { [mainLocale]: entity.name },
                            fields: entity.fields.map((f) => f.name),
                            relations: {},
                          }
                        : undefined,
                    )
                  }
                />
                {a("ontologyEnable")}
              </label>
            </header>
            {!available && <p className="hint">{a("ontologyLimit")}</p>}
            {node && (
              <>
                <label className="field-label">
                  {a("ontologyType")}
                  <input
                    value={node.nodeType}
                    maxLength={32}
                    onChange={(event) =>
                      set(entity.name, {
                        ...node,
                        nodeType: event.target.value,
                      })
                    }
                  />
                </label>
                <code>{`app.${manifest.id}.${node.nodeType}`}</code>
                <LocalizedField
                  label={a("name")}
                  value={node.label}
                  onChange={(label) =>
                    set(entity.name, {
                      ...node,
                      label: Object.fromEntries(
                        Object.entries(label).filter(
                          (entry): entry is [string, string] =>
                            typeof entry[1] === "string",
                        ),
                      ),
                    })
                  }
                />
                <fieldset>
                  <legend>{a("ontologyFields")}</legend>
                  <div className="app-tool-grid">
                    {entity.fields.map((field) => (
                      <label className="app-check" key={field.name}>
                        <input
                          type="checkbox"
                          checked={node.fields.includes(field.name)}
                          onChange={(event) =>
                            set(entity.name, {
                              ...node,
                              fields: event.target.checked
                                ? [
                                    ...node.fields.filter((name) =>
                                      entity.fields.some(
                                        (f) => f.name === name,
                                      ),
                                    ),
                                    field.name,
                                  ]
                                : node.fields.filter(
                                    (name) =>
                                      name !== field.name &&
                                      entity.fields.some(
                                        (f) => f.name === name,
                                      ),
                                  ),
                              relations: Object.fromEntries(
                                Object.entries(node.relations ?? {}).filter(
                                  ([name]) =>
                                    name !== field.name || event.target.checked,
                                ),
                              ),
                            })
                          }
                        />
                        <code>{field.name}</code>
                        {field.coreReference && (
                          <code>{field.coreReference}</code>
                        )}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {entity.fields
                  .filter(
                    (f) =>
                      node.fields.includes(f.name) &&
                      (f.coreReference || f.references),
                  )
                  .map((field) => (
                    <label className="field-label" key={field.name}>
                      {a("ontologyRelation")} <code>{field.name}</code>
                      <input
                        maxLength={32}
                        value={node.relations?.[field.name] ?? ""}
                        onChange={(event) =>
                          set(entity.name, {
                            ...node,
                            relations: Object.fromEntries(
                              Object.entries({
                                ...node.relations,
                                [field.name]: event.target.value,
                              }).filter(([, value]) => !!value),
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
