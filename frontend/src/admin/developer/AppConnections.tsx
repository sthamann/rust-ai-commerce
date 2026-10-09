/** Route, tool, grounding and Flow Builder switches modify the shared executable manifest directly. */
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import AppModules from "./AppModules";
import AppOntology from "./AppOntology";
import AppMenuEditor from "./AppMenuEditor";
import AppAutomation from "./AppAutomation";
import AppActionAccess from "./AppActionAccess";
import LocalizedField from "../../shared/i18n/LocalizedField";
import Icon from "../../shared/ui/Icon";
import type { Manifest } from "../../shared/apps/native/types";
import { textMap } from "./app-model";
export default function AppConnections({
  manifest,
  onChange,
  onFlows,
}: {
  manifest: Manifest;
  onChange: (m: Manifest) => void;
  onFlows: () => void;
}) {
  const { a } = useAppStudioText();
  const ai = manifest.intelligence ?? {
    description: manifest.name,
    tools: [],
    entities: [],
  };
  return (
    <div className="app-connections">
      <AppActionAccess manifest={manifest} onChange={onChange} />
      <AppAutomation manifest={manifest} onChange={onChange} />
      <AppModules manifest={manifest} onChange={onChange} />
      <AppMenuEditor manifest={manifest} onChange={onChange} />
      <section className="app-model-card">
        <header>
          <Icon name="link" />
          <h2>{a("api")}</h2>
        </header>
        {manifest.actions?.map((action) => {
          const route = manifest.apiRoutes?.find(
            (r) => r.action === action.name && r.scope === "admin",
          );
          return (
            <div className="app-connection-row" key={action.name}>
              <code>{action.name}</code>
              <span>{action.handler === "list" ? "GET" : "POST"}</span>
              <label className="app-check">
                <input
                  type="checkbox"
                  checked={!!route}
                  onChange={(e) =>
                    onChange({
                      ...manifest,
                      apiRoutes: e.target.checked
                        ? [
                            ...(manifest.apiRoutes ?? []),
                            {
                              path: action.name,
                              method:
                                action.handler === "list" ? "GET" : "POST",
                              scope: "admin",
                              action: action.name,
                            },
                          ]
                        : (manifest.apiRoutes ?? []).filter((r) => r !== route),
                    })
                  }
                />
                API
              </label>
              {route && (
                <code>{`/api/apps/${manifest.id}/http/${route.path}`}</code>
              )}
              {action.public && (
                <label className="app-check">
                  <input
                    type="checkbox"
                    checked={
                      manifest.apiRoutes?.some(
                        (r) =>
                          r.action === action.name && r.scope === "storefront",
                      ) ?? false
                    }
                    onChange={(e) =>
                      onChange({
                        ...manifest,
                        apiRoutes: e.target.checked
                          ? [
                              ...(manifest.apiRoutes ?? []),
                              {
                                path: action.name,
                                method: "GET",
                                scope: "storefront",
                                action: action.name,
                              },
                            ]
                          : (manifest.apiRoutes ?? []).filter(
                              (r) =>
                                !(
                                  r.action === action.name &&
                                  r.scope === "storefront"
                                ),
                            ),
                      })
                    }
                  />
                  {a("storefront")}
                </label>
              )}
            </div>
          );
        })}
      </section>
      <section className="app-model-card">
        <header>
          <Icon name="spark" />
          <h2>{a("ai")}</h2>
        </header>
        <LocalizedField
          label={a("body")}
          value={ai.description}
          onChange={(v) =>
            onChange({
              ...manifest,
              intelligence: { ...ai, description: textMap(v) },
            })
          }
          multiline
          maxLength={1000}
        />
        <div className="app-tool-grid">
          {manifest.actions?.map((action) => (
            <label className="app-check" key={action.name}>
              <input
                type="checkbox"
                checked={ai.tools.includes(action.name)}
                onChange={(e) =>
                  onChange({
                    ...manifest,
                    intelligence: {
                      ...ai,
                      tools: e.target.checked
                        ? [...ai.tools, action.name]
                        : ai.tools.filter((n) => n !== action.name),
                    },
                  })
                }
              />
              <code>{`app.${manifest.id}.${action.name}`}</code>
            </label>
          ))}
        </div>
        <div className="app-tool-grid">
          {manifest.entities.map((entity) => (
            <label className="app-check" key={entity.name}>
              <input
                type="checkbox"
                checked={ai.entities.includes(entity.name)}
                onChange={(e) =>
                  onChange({
                    ...manifest,
                    intelligence: {
                      ...ai,
                      entities: e.target.checked
                        ? [...ai.entities, entity.name]
                        : ai.entities.filter((n) => n !== entity.name),
                      ontology: e.target.checked
                        ? ai.ontology
                        : ai.ontology?.filter((n) => n.entity !== entity.name),
                    },
                  })
                }
              />
              <Icon name="graph" size={15} />
              {entity.name}
            </label>
          ))}
        </div>
      </section>
      <AppOntology manifest={manifest} onChange={onChange} />
      <section className="app-model-card">
        <header>
          <Icon name="pulse" />
          <h2>{a("flow")}</h2>
        </header>
        <div className="app-flow-chain">
          <span>{a("flow")}</span>
          <Icon name="arrow" />
          <span>{manifest.id}</span>
          <Icon name="arrow" />
          <span>{`app.record.changed`}</span>
        </div>
        <p>{a("flowHint")}</p>
        {manifest.actions
          ?.filter(
            (action) =>
              ["save", "service", "emit"].includes(action.handler) &&
              !action.public &&
              !action.readOnly,
          )
          .map((action) => (
            <label className="app-check" key={action.name}>
              <input
                type="checkbox"
                checked={action.flowAllowed ?? false}
                onChange={(e) =>
                  onChange({
                    ...manifest,
                    actions: manifest.actions?.map((n) =>
                      n.name === action.name
                        ? { ...n, flowAllowed: e.target.checked }
                        : n,
                    ),
                  })
                }
              />
              {a("enableFlow")} · <code>{action.name}</code>
            </label>
          ))}
        <button className="studio-secondary" onClick={onFlows}>
          {a("openFlows")}
          <Icon name="arrow" size={16} />
        </button>
      </section>
    </div>
  );
}
