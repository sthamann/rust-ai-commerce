/** One content language edits app/view/block metadata; changing bindings updates the actual manifest. */
import AppControlProperties from "./AppControlProperties";
import AppGeometry from "./AppGeometry";
import AppContextBinding from "./AppContextBinding";
import { placements } from "./assistant-model";
import { useAssistantText } from "../../shared/i18n/app-assistant-i18n";
import LocalizedField from "../../shared/i18n/LocalizedField";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import type { Manifest, NativeView } from "../../shared/apps/native/types";
import { locations, textMap } from "./app-model";
export default function AppInspector({
  manifest,
  view,
  selected,
  onChange,
}: {
  manifest: Manifest;
  view: NativeView;
  selected: string;
  onChange: (m: Manifest) => void;
}) {
  const { a } = useAppStudioText();
  const { t } = useAssistantText();
  const block = view.blocks.find((b) => b.id === selected),
    surface = manifest.surfaces?.find((s) => s.uiPath === `native/${view.id}`);
  const patch = (v: Partial<NativeView>) =>
    onChange({
      ...manifest,
      views: manifest.views?.map((item) =>
        item.id === view.id ? { ...item, ...v } : item,
      ),
    });
  return (
    <aside className="app-inspector">
      <span className="app-panel-label">{a("inspector")}</span>
      <LocalizedField
        label={a("name")}
        value={manifest.name}
        onChange={(v) => onChange({ ...manifest, name: textMap(v) })}
        required
        maxLength={100}
      />
      <label>
        {a("id")}
        <input
          value={manifest.id}
          maxLength={32}
          onChange={(e) => onChange({ ...manifest, id: e.target.value })}
        />
      </label>
      <label>
        {a("version")}
        <input
          value={manifest.version}
          maxLength={32}
          onChange={(e) => onChange({ ...manifest, version: e.target.value })}
        />
      </label>
      <div className="app-inspector-divider" />
      <label>
        {a("layout")}
        <select
          value={view.layout}
          onChange={(e) =>
            patch({ layout: e.target.value as NativeView["layout"] })
          }
        >
          <option value="stack">{a("stack")}</option>
          <option value="grid">{a("grid")}</option>
          <option value="form">{a("formDesigner")}</option>
        </select>
      </label>
      {surface && (
        <>
          <label>
            {a("location")}
            <select
              value={surface.location}
              onChange={(e) =>
                onChange({
                  ...manifest,
                  surfaces: manifest.surfaces?.map((s) =>
                    s.id === surface.id
                      ? { ...s, location: e.target.value }
                      : s,
                  ),
                })
              }
            >
              {Object.keys({ ...locations, ...placements })
                .map((value) => [value, value] as const)
                .map(([value, key]) => (
                  <option value={value} key={value}>
                    {placements[key] ? t(placements[key]) : a(locations[key])}
                  </option>
                ))}
            </select>
          </label>
          <LocalizedField
            label={a("title")}
            value={surface.label}
            onChange={(v) =>
              onChange({
                ...manifest,
                surfaces: manifest.surfaces?.map((s) =>
                  s.id === surface.id ? { ...s, label: textMap(v) } : s,
                ),
              })
            }
            required
            maxLength={100}
          />
        </>
      )}
      <div className="app-inspector-divider" />
      {block ? (
        <>
          <span className="soft-tag">
            {a(block.kind)} · {block.id}
          </span>
          <LocalizedField
            label={a("title")}
            value={block.title}
            onChange={(v) =>
              patch({
                blocks: view.blocks.map((b) =>
                  b.id === selected ? { ...b, title: textMap(v) } : b,
                ),
              })
            }
            required
            maxLength={100}
          />
          <AppGeometry
            index={view.blocks.indexOf(block)}
            block={block}
            onChange={(next) =>
              patch({
                blocks: view.blocks.map((b) => (b.id === selected ? next : b)),
              })
            }
          />
          {block.kind === "text" ? (
            <LocalizedField
              label={a("body")}
              value={block.text ?? {}}
              onChange={(v) =>
                patch({
                  blocks: view.blocks.map((b) =>
                    b.id === selected ? { ...b, text: textMap(v) } : b,
                  ),
                })
              }
              multiline
              maxLength={2000}
            />
          ) : (
            <AppControlProperties
              manifest={manifest}
              view={view}
              block={block}
              onChange={(next) =>
                patch({
                  blocks: view.blocks.map((b) =>
                    b.id === selected ? next : b,
                  ),
                })
              }
            />
          )}
          {block.kind !== "text" && (
            <AppContextBinding
              manifest={manifest}
              block={block}
              onChange={(next) =>
                patch({
                  blocks: view.blocks.map((b) =>
                    b.id === block.id ? next : b,
                  ),
                })
              }
            />
          )}
        </>
      ) : (
        <p className="muted">{a("select")}</p>
      )}
    </aside>
  );
}
