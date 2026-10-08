/** F4 presentation properties use one content language; layout values remain bounded grid units. */
import { useState } from "react";
import type { Block } from "../../shared/apps/native/types";
import { geometry, snap } from "../../shared/apps/native/geometry";
import LocalizedField from "../../shared/i18n/LocalizedField";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import { textMap } from "./app-model";
export default function AppGeometry({
  block,
  index,
  onChange,
}: {
  block: Block;
  index: number;
  onChange: (b: Block) => void;
}) {
  const { a } = useAppStudioText();
  const g = geometry(block, index);
  const [order, setOrder] = useState("categorized");
  const captions = {
    x: "positionX",
    y: "positionY",
    w: "width",
    h: "height",
  } as const;
  const keys = (["x", "y", "w", "h"] as const)
    .slice()
    .sort((left, right) =>
      order === "alphabetical"
        ? a(captions[left]).localeCompare(a(captions[right]))
        : 0,
    );
  return (
    <div className="app-properties-grid">
      <label>
        {a("propertySort")}
        <select value={order} onChange={(e) => setOrder(e.target.value)}>
          <option value="categorized">{a("categorized")}</option>
          <option value="alphabetical">{a("alphabetical")}</option>
        </select>
      </label>
      {keys.map((key) => (
        <label key={key}>
          {a(
            (
              {
                x: "positionX",
                y: "positionY",
                w: "width",
                h: "height",
              } as const
            )[key],
          )}
          <input
            type="number"
            min={key === "w" || key === "h" ? 1 : 0}
            max={key === "y" ? 200 : key === "h" ? 40 : 12}
            value={g[key]}
            onChange={(e) =>
              onChange({
                ...block,
                geometry: snap({ ...g, [key]: Number(e.target.value) }),
              })
            }
          />
        </label>
      ))}
      {(["visible", "enabled"] as const).map((key) => (
        <label className="app-check" key={key}>
          <input
            type="checkbox"
            checked={block[key] !== false}
            onChange={(e) => onChange({ ...block, [key]: e.target.checked })}
          />
          {a(key)}
        </label>
      ))}
      <label>
        {a("tabOrder")}
        <input
          type="number"
          min="0"
          max="1000"
          value={block.tabOrder ?? 0}
          onChange={(e) =>
            onChange({ ...block, tabOrder: Number(e.target.value) })
          }
        />
      </label>
      <LocalizedField
        label={a("tooltip")}
        value={block.tooltip ?? {}}
        maxLength={300}
        onChange={(v) => onChange({ ...block, tooltip: textMap(v) })}
      />
    </div>
  );
}
