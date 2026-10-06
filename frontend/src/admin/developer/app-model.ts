/** Pure schema edits preserve unsupported extension properties; compilation binds native UI to real actions. */
import { appText, type AppStudioKey } from "../../shared/i18n/app-studio-i18n";
import type {
  Block,
  Manifest,
  NativeView,
  Text,
} from "../../shared/apps/native/types";
export const locations: Record<string, AppStudioKey> = {
  "admin.navigation": "admin",
  "storefront.page": "storefront",
  "product.detail": "product",
  "storefront.home": "home",
};
export function nextId(prefix: string, existing: string[]) {
  let n = 1;
  while (existing.includes(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}
export function binding(kind: Block["kind"], entity?: string): Partial<Block> {
  return kind === "text"
    ? { entity: null, readAction: null, writeAction: null }
    : {
        entity,
        readAction: `list_${entity?.slice(0, 27)}`,
        writeAction: kind === "form" ? `save_${entity?.slice(0, 27)}` : null,
      };
}
export function newBlock(
  kind: Block["kind"],
  view: NativeView,
  entity?: string,
): Block {
  return {
    id: nextId(
      kind,
      view.blocks.map((b) => b.id),
    ),
    kind,
    title: appText(kind),
    text: kind === "text" ? appText("example") : {},
    ...binding(kind, entity),
  };
}
export function template(): Manifest {
  const name = appText("template");
  return compile({
    id: `care_${Date.now().toString(36)}`,
    version: "0.1.0",
    coreApi: "1",
    runtime: "declarative",
    category: "operations",
    name,
    permissions: ["data.read", "data.write", "admin.slot", "storefront.slot"],
    entities: [
      {
        name: "guides",
        label: appText("entry"),
        publicRead: false,
        fields: [
          {
            name: "title",
            label: appText("title"),
            kind: "string",
            translatable: true,
            required: true,
            indexed: false,
          },
          {
            name: "instructions",
            label: appText("body"),
            kind: "string",
            translatable: true,
            required: false,
            indexed: false,
          },
        ],
      },
    ],
    slots: [],
    views: [
      {
        id: "workspace",
        layout: "stack",
        blocks: [
          {
            id: "welcome",
            kind: "text",
            title: name,
            text: appText("example"),
          },
          {
            id: "records",
            kind: "table",
            title: appText("entry"),
            ...binding("table", "guides"),
          },
          {
            id: "editor",
            kind: "form",
            title: appText("newRecord"),
            ...binding("form", "guides"),
          },
        ],
      },
    ],
    surfaces: [
      {
        id: "workspace",
        location: "admin.navigation",
        label: name,
        uiPath: "native/workspace",
        actions: [],
      },
    ],
    apiRoutes: [],
    intelligence: { description: name, tools: [], entities: [] },
  });
}
export function compile(input: Manifest): Manifest {
  const m = structuredClone(input);
  if (!m.views?.length) return m;
  const custom = (m.actions ?? []).filter(
    (a) =>
      !m.entities.some(
        (e) =>
          a.name === `list_${e.name.slice(0, 27)}` ||
          a.name === `save_${e.name.slice(0, 27)}`,
      ),
  );
  m.actions = [
    ...custom,
    ...m.entities.flatMap((e) => {
      const suffix = e.name.slice(0, 27),
        old = m.actions?.find((a) => a.name === `save_${suffix}`),
        read = m.actions?.find((a) => a.name === `list_${suffix}`);
      return [
        {
          name: `list_${suffix}`,
          description: `List ${e.name}`,
          handler: "list",
          entity: e.name,
          public: e.publicRead,
          readOnly: true,
          mcp: read?.mcp,
          permission: e.publicRead ? undefined : read?.permission,
          inputSchema: {
            type: "object",
            properties: {
              limit: { type: "integer" },
              after: { type: "string" },
              filter: { type: "object" },
            },
            additionalProperties: false,
          },
        },
        {
          name: `save_${suffix}`,
          description: `Save ${e.name}`,
          handler: "save",
          entity: e.name,
          public: false,
          flowAllowed: old?.flowAllowed ?? true,
          permission: old?.permission,
          mcp: old?.mcp,
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string" },
              revision: { type: "integer" },
              fields: { type: "object" },
            },
            required: ["id", "fields"],
            additionalProperties: false,
          },
        },
      ];
    }),
  ];
  m.surfaces = m.surfaces?.map((s) => {
    const view = m.views?.find((v) => s.uiPath === `native/${v.id}`);
    return view
      ? {
          ...s,
          actions: [
            ...new Set(
              view.blocks.flatMap((b) =>
                [b.readAction, b.writeAction].filter((n): n is string => !!n),
              ),
            ),
          ],
        }
      : s;
  });
  return m;
}
export function problems(m: Manifest) {
  const ids = [
    m.id,
    ...m.entities.map((e) => e.name),
    ...m.entities.flatMap((e) => e.fields.map((f) => f.name)),
    ...(m.views ?? []).map((v) => v.id),
  ];
  return (
    (m.paymentProvider !== undefined &&
      (m.runtime !== "service" ||
        m.category !== "payment" ||
        !m.permissions.includes("payments.provider") ||
        m.paymentProvider.apiVersion !== "1" ||
        m.paymentProvider.methods.length === 0 ||
        m.paymentProvider.methods.length > 32 ||
        new Set(m.paymentProvider.methods.map((v) => v.id)).size !==
          m.paymentProvider.methods.length ||
        m.paymentProvider.methods.some(
          (v) =>
            !/^[a-z][a-z0-9_]{0,31}$/.test(v.id) ||
            !v.currencies.length ||
            v.currencies.some((c) => !/^[A-Z]{3}$/.test(c)) ||
            !v.capabilities.includes(v.intent),
        ))) ||
    ids.some((id) => !/^[a-z][a-z0-9_]{0,31}$/.test(id)) ||
    !/^\d+\.\d+\.\d+$/.test(m.version) ||
    m.entities.length > 12 ||
    m.entities.some(
      (e) =>
        e.fields.length === 0 ||
        e.fields.length > 16 ||
        new Set(e.fields.map((f) => f.name)).size !== e.fields.length ||
        e.fields.some((f) => ["tenant", "id", "revision"].includes(f.name)),
    ) ||
    new Set(m.entities.map((e) => e.name)).size !== m.entities.length ||
    (m.views ?? []).some(
      (v) =>
        v.blocks.length > 32 ||
        v.blocks.some(
          (b) =>
            b.kind !== "text" && !m.entities.some((e) => e.name === b.entity),
        ),
    ) ||
    (m.surfaces ?? []).some(
      (s) =>
        !s.location.startsWith("admin.") &&
        m.views
          ?.find((v) => s.uiPath === `native/${v.id}`)
          ?.blocks.some(
            (b) =>
              b.kind === "form" ||
              (b.kind !== "text" &&
                !m.entities.find((e) => e.name === b.entity)?.publicRead),
          ),
    )
  );
}
export function removeEntity(m: Manifest, name: string): Manifest {
  const actions = m.actions?.filter((a) => a.entity !== name) ?? [],
    allowed = new Set(actions.map((a) => a.name));
  return compile({
    ...m,
    entities: m.entities.filter((e) => e.name !== name),
    actions,
    views: m.views?.map((v) => ({
      ...v,
      blocks: v.blocks.filter((b) => b.entity !== name),
    })),
    apiRoutes: m.apiRoutes?.filter((r) => allowed.has(r.action)),
    intelligence: m.intelligence
      ? {
          ...m.intelligence,
          tools: m.intelligence.tools.filter((n) => allowed.has(n)),
          entities: m.intelligence.entities.filter((n) => n !== name),
        }
      : undefined,
  });
}
export function bump(version: string) {
  const n = version.split(".").map(Number);
  return n.length === 3 && n.every(Number.isInteger)
    ? `${n[0]}.${n[1]}.${n[2] + 1}`
    : "0.1.0";
}
export function textMap(
  value: Record<string, string | null | undefined>,
): Text {
  return Object.fromEntries(
    Object.entries(value).filter(
      (v): v is [string, string] => typeof v[1] === "string",
    ),
  );
}
export type History = {
  present: Manifest;
  past: Manifest[];
  future: Manifest[];
};
export function editHistory(
  state: History,
  edit: Manifest | "undo" | "redo" | "reset",
): History {
  if (edit === "undo")
    return state.past.length
      ? {
          present: state.past.at(-1)!,
          past: state.past.slice(0, -1),
          future: [state.present, ...state.future],
        }
      : state;
  if (edit === "redo")
    return state.future.length
      ? {
          present: state.future[0],
          past: [...state.past, state.present],
          future: state.future.slice(1),
        }
      : state;
  if (edit === "reset") return { present: template(), past: [], future: [] };
  return {
    present: compile(edit),
    past: [...state.past.slice(-49), state.present],
    future: [],
  };
}

/** Renaming a draft model rewrites all schema references; installed schema compatibility stays server enforced. */
export function renameEntity(m: Manifest, from: string, to: string): Manifest {
  const action = (name: string) =>
    name === `list_${from.slice(0, 27)}`
      ? `list_${to.slice(0, 27)}`
      : name === `save_${from.slice(0, 27)}`
        ? `save_${to.slice(0, 27)}`
        : name;
  return compile({
    ...m,
    entities: m.entities.map((e) => ({
      ...e,
      name: e.name === from ? to : e.name,
      fields: e.fields.map((f) =>
        f.references === from ? { ...f, references: to } : f,
      ),
    })),
    actions: m.actions?.map((a) =>
      a.entity === from ? { ...a, name: action(a.name), entity: to } : a,
    ),
    views: m.views?.map((v) => ({
      ...v,
      blocks: v.blocks.map((b) =>
        b.entity === from ? { ...b, ...binding(b.kind, to) } : b,
      ),
    })),
    apiRoutes: m.apiRoutes?.map((r) => ({ ...r, action: action(r.action) })),
    intelligence: m.intelligence
      ? {
          ...m.intelligence,
          tools: m.intelligence.tools.map(action),
          entities: m.intelligence.entities.map((n) => (n === from ? to : n)),
        }
      : undefined,
  });
}
