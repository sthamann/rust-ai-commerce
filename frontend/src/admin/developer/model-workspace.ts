/** Form wizard emits the standard manifest IR; the ordinary compiler supplies all actions, APIs and permission allowlists. */
import type { Manifest } from "../../shared/apps/native/types";
import { compile, nextId, binding } from "./app-model";
import { appText } from "../../shared/i18n/app-studio-i18n";
export function modelWorkspace(m: Manifest, name: string): Manifest {
  const e = m.entities.find((e) => e.name === name);
  if (!e || (m.views?.length ?? 0) >= 8 || (m.surfaces?.length ?? 0) >= 12)
    return m;
  const id = nextId("workspace", m.views?.map((v) => v.id) ?? []);
  return compile({
    ...m,
    permissions: [
      ...new Set([...m.permissions, "data.read", "data.write", "admin.slot"]),
    ],
    views: [
      ...(m.views ?? []),
      {
        id,
        layout: "form",
        blocks: [
          {
            id: "records",
            kind: "table",
            title: e.label,
            ...binding("table", name),
            geometry: { x: 0, y: 0, w: 6, h: 10 },
          },
          {
            id: "editor",
            kind: "form",
            title: appText("record"),
            ...binding("form", name),
            geometry: { x: 6, y: 0, w: 6, h: 10 },
          },
          {
            id: "save",
            kind: "button",
            title: appText("save"),
            geometry: { x: 6, y: 10, w: 6, h: 2 },
            handlers: {
              click: [
                { op: "validate", target: "editor" },
                {
                  op: "call",
                  action: `save_${name.slice(0, 27)}`,
                  input: { kind: "record", block: "editor" },
                },
                { op: "refresh", target: "records" },
              ],
            },
          },
        ],
      },
    ],
    surfaces: [
      ...(m.surfaces ?? []),
      {
        id,
        location: "admin.navigation",
        label: e.label,
        uiPath: `native/${id}`,
        actions: [],
      },
    ],
  });
}
