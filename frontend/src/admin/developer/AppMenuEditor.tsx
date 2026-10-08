/** Menu and injection sites are the existing surfaces, with explicit action allowlists and live role scopes. */
import type { Manifest, Surface } from "../../shared/apps/native/types";
import LocalizedField from "../../shared/i18n/LocalizedField";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import { useAssistantText } from "../../shared/i18n/app-assistant-i18n";
import { locations, textMap } from "./app-model";
import { placements } from "./assistant-model";
import { appScopes } from "./AppActionAccess";
export default function AppMenuEditor({
  manifest,
  onChange,
}: {
  manifest: Manifest;
  onChange: (m: Manifest) => void;
}) {
  const { a } = useAppStudioText(),
    { t } = useAssistantText();
  const surfaces = manifest.surfaces ?? [];
  const patch = (id: string, p: Partial<Surface>) =>
    onChange({
      ...manifest,
      surfaces: surfaces.map((s) => (s.id === id ? { ...s, ...p } : s)),
    });
  return (
    <section className="app-model-card">
      <h2>{a("menuEditor")}</h2>
      <p>{a("menuHint")}</p>
      {surfaces.map((s) => (
        <article className="app-model-card" key={s.id}>
          <header>
            <code>{s.id}</code>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...manifest,
                  surfaces: surfaces.filter((x) => x.id !== s.id),
                })
              }
            >
              {a("delete")}
            </button>
          </header>
          <LocalizedField
            label={a("title")}
            value={s.label}
            onChange={(v) => patch(s.id, { label: textMap(v) })}
            required
            maxLength={100}
          />
          <label>
            {a("location")}
            <select
              value={s.location}
              onChange={(e) => patch(s.id, { location: e.target.value })}
            >
              {Object.keys({ ...locations, ...placements }).map((l) => (
                <option key={l} value={l}>
                  {placements[l] ? t(placements[l]) : a(locations[l])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {a("design")}
            <select
              value={s.uiPath}
              onChange={(e) => patch(s.id, { uiPath: e.target.value })}
            >
              {!manifest.views?.some((v) => s.uiPath === `native/${v.id}`) && (
                <option value={s.uiPath}>{s.uiPath}</option>
              )}
              {manifest.views?.map((v) => (
                <option key={v.id} value={"native/" + v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            {a("surfacePermission")}
            <select
              value={s.permission ?? ""}
              onChange={(e) =>
                patch(s.id, { permission: e.target.value || undefined })
              }
            >
              <option value="">—</option>
              {appScopes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <div className="app-tool-grid">
            {manifest.actions?.map((x) => (
              <label className="app-check" key={x.name}>
                <input
                  type="checkbox"
                  checked={s.actions.includes(x.name)}
                  onChange={(e) =>
                    patch(s.id, {
                      actions: e.target.checked
                        ? [...s.actions, x.name]
                        : s.actions.filter((n) => n !== x.name),
                    })
                  }
                />
                <code>{x.name}</code>
              </label>
            ))}
          </div>
        </article>
      ))}
      <button
        type="button"
        disabled={!manifest.views?.length || surfaces.length >= 12}
        onClick={() => {
          const id =
            "surface_" + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
          onChange({
            ...manifest,
            surfaces: [
              ...surfaces,
              {
                id,
                location: "admin.navigation",
                label: manifest.name,
                uiPath: "native/" + manifest.views![0].id,
                actions: [],
              },
            ],
          });
        }}
      >
        {a("addMenu")}
      </button>
    </section>
  );
}
