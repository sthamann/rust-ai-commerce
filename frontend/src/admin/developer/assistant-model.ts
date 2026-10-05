/** Assistants compile to the public manifest contract, with no hidden runtime or provider code. */
import type { Manifest, Block } from "../../shared/apps/native/types";
import {
  assistantText,
  type AssistantKey,
} from "../../shared/i18n/app-assistant-i18n";
import { binding, compile } from "./app-model";
export const appKinds = [
  "frontend",
  "admin",
  "combined",
  "payment",
  "shipping",
  "integration",
  "event",
  "webhook",
  "scheduled",
] as const;
export type AppKind = (typeof appKinds)[number];
export const placements: Record<string, AssistantKey> = {
  "admin.navigation": "navigation",
  "admin.product.general": "productGeneral",
  "admin.product.tab": "productTab",
  "admin.customer": "customerFields",
  "admin.order": "orderFields",
  "product.detail": "productDetail",
  "storefront.page": "storefrontPage",
};
export const contextKeys = {
  product: "productId",
  customer: "customerId",
  order: "orderId",
} as const;
export function coreKind(
  location: string,
): "product" | "customer" | "order" | undefined {
  return location.includes("product")
    ? "product"
    : location === "admin.customer"
      ? "customer"
      : location.startsWith("admin.order")
        ? "order"
        : undefined;
}
export type AssistantSetup = {
  kind: AppKind;
  id: string;
  name: Manifest["name"];
  location: string;
  mcp: boolean;
  publicRead: boolean;
  event: string;
  cron: string;
};
export function assistedManifest(s: AssistantSetup): Manifest {
  const service = ["payment", "shipping", "integration", "event"].includes(
    s.kind,
  );
  const core = coreKind(s.location),
    field = core ? `${core}_id` : undefined;
  const isPublic =
    s.kind === "frontend" ||
    (s.publicRead && core !== "customer" && core !== "order");
  const scope =
    core === "customer" ? "customers" : core === "order" ? "orders" : "catalog";
  const block = (kind: Block["kind"], id: string): Block => ({
    id,
    kind,
    title: assistantText(kind === "form" ? "setup" : "body"),
    ...binding(kind, "entries"),
    ...(core
      ? { contextBinding: { field: field!, key: contextKeys[core] } }
      : {}),
  });
  const m: Manifest = {
    id: s.id,
    version: "0.1.0",
    coreApi: "1",
    runtime: service ? "service" : "declarative",
    name: s.name,
    category:
      s.kind === "payment"
        ? "payment"
        : s.kind === "frontend"
          ? "design"
          : "operations",
    permissions: [
      "data.read",
      "data.write",
      "admin.slot",
      ...(isPublic ? ["storefront.slot"] : []),
      ...(service ? ["service.call", "events.read"] : []),
      ...(["webhook", "scheduled"].includes(s.kind) ? ["events.publish"] : []),
    ],
    entities: [
      {
        name: "entries",
        label: s.name,
        publicRead: isPublic,
        fields: [
          ...(core
            ? [
                {
                  name: field!,
                  label: assistantText("object"),
                  kind: "string" as const,
                  required: true,
                  indexed: true,
                  coreReference: core,
                },
              ]
            : []),
          {
            name: "title",
            label: assistantText("title"),
            kind: "string",
            translatable: true,
            required: true,
          },
          {
            name: "body",
            label: assistantText("body"),
            kind: "string",
            translatable: true,
          },
          {
            name: "segment",
            label: assistantText("choice"),
            kind: "string",
            choices: [
              { value: "standard", label: assistantText("standard") },
              { value: "priority", label: assistantText("priority") },
            ],
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
          ...(core ? [] : [block("table", "records")]),
          block("form", "editor"),
        ],
      },
    ],
    surfaces: [
      {
        id: "workspace",
        location: s.location.startsWith("admin.")
          ? s.location
          : core
            ? "admin.product.tab"
            : "admin.navigation",
        label: s.name,
        uiPath: "native/workspace",
        actions: [],
        permission: `${scope}.read`,
      },
    ],
    apiRoutes: [],
    intelligence: { description: s.name, tools: [], entities: [] },
  };
  // A public app still gets a private editor. Product content shares an explicit indexed reference.
  if (s.kind === "frontend" && core)
    m.surfaces![0].location = "admin.product.tab";
  if (isPublic) {
    m.views!.push({
      id: "shopper",
      layout: "stack",
      blocks: [block("cards", "content")],
    });
    m.surfaces!.push({
      id: "shopper",
      location: core ? "product.detail" : "storefront.page",
      label: s.name,
      uiPath: "native/shopper",
      actions: [],
    });
  }
  if (service) {
    m.events = [s.event];
    const names =
      s.kind === "payment"
        ? ["initiate", "capture", "refund"]
        : s.kind === "shipping"
          ? ["create_label", "track"]
          : ["synchronize"];
    m.actions = names.map((name) => ({
      name,
      description: name,
      handler: "service",
      public: false,
      permission: s.kind === "payment" ? "payments.manage" : "orders.write",
      mcp: s.mcp,
      flowAllowed: s.kind !== "payment",
      inputSchema: {
        type: "object",
        properties: { payload: { type: "object" } },
        required: ["payload"],
        additionalProperties: false,
      },
    }));
  }
  if (s.kind === "scheduled" || s.kind === "webhook") {
    m.actions = [
      {
        name: "received",
        description: s.kind,
        handler: "emit",
        public: false,
        mcp: s.mcp,
        permission: "apps.manage",
        flowAllowed: false,
        inputSchema: {
          type: "object",
          properties: { payload: { type: "object" } },
          additionalProperties: false,
        },
      },
    ];
    if (s.kind === "scheduled")
      m.schedules = [
        {
          id: "recurring",
          cron: s.cron,
          action: "received",
          input: { payload: {} },
          enabled: true,
        },
      ];
    else m.webhooks = [{ id: "incoming", action: "received" }];
  }
  const result = compile(m);
  result.actions = result.actions!.map((a) =>
    a.entity
      ? {
          ...a,
          mcp: s.mcp,
          permission: a.public
            ? undefined
            : `${scope}.${a.handler === "list" ? "read" : "write"}`,
        }
      : a,
  );
  result.apiRoutes = result.actions
    .filter((a) => a.handler === "list")
    .map((a) => ({
      path: a.name,
      method: "GET",
      scope: a.public ? "storefront" : "admin",
      action: a.name,
    }));
  return result;
}
