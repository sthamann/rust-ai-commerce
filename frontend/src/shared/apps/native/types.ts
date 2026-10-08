/** The versioned Manifest is the shared intermediate representation for visual and agent edits. */
export type Text = Record<string, string>;
export type Field = {
  name: string;
  label: Text;
  kind:
    | "string"
    | "integer"
    | "boolean"
    | "json"
    | "date"
    | "datetime"
    | "money"
    | "decimal"
    | "image"
    | "file"
    | "richtext"
    | "relations";
  translatable?: boolean;
  required?: boolean;
  indexed?: boolean;
  unique?: boolean;
  validation?: Record<string, unknown>;
  references?: string | null;
  coreReference?: "product" | "customer" | "order" | null;
  choices?: { value: string; label: Text }[];
};
export type Entity = {
  name: string;
  label: Text;
  fields: Field[];
  publicRead: boolean;
};
export type Block = {
  id: string;
  kind:
    | "text"
    | "table"
    | "cards"
    | "form"
    | "button"
    | "textbox"
    | "combobox"
    | "checkbox"
    | "datepicker"
    | "image"
    | "frame"
    | "tabs"
    | "kpi"
    | "chart";
  title: Text;
  text?: Text;
  entity?: string | null;
  readAction?: string | null;
  writeAction?: string | null;
  geometry?: { x: number; y: number; w: number; h: number };
  visible?: boolean;
  enabled?: boolean;
  tabOrder?: number;
  inlineEdit?: boolean;
  tooltip?: Text;
  dataField?: string;
  childBlocks?: string[];
  handlers?: { click?: Statement[]; change?: Statement[] };
  contextBinding?: {
    field: string;
    key: "productId" | "customerId" | "orderId";
  } | null;
};
export type NativeView = {
  id: string;
  layout: "stack" | "grid" | "form";
  blocks: Block[];
};
export type Surface = {
  id: string;
  location: string;
  label: Text;
  uiPath: string;
  actions: string[];
  permission?: string;
};
export type Action = {
  name: string;
  description: string;
  handler: string;
  entity?: string;
  public: boolean;
  inputSchema: Record<string, unknown>;
  flowAllowed?: boolean;
  mcp?: boolean | null;
  readOnly?: boolean;
  permission?: string;
};
export type Manifest = {
  id: string;
  version: string;
  coreApi: string;
  runtime: string;
  name: Text;
  category?: string;
  presentation?: { icon?: string; cover?: string; description?: Text };
  paymentProvider?: {
    apiVersion: "1";
    methods: {
      id: string;
      name: Text;
      currencies: string[];
      countries: string[];
      capabilities: string[];
      checkout: "redirect" | "embedded";
      intent: "capture" | "authorize";
    }[];
  };
  commerceHooks?: {
    source: string;
    hooks: ("price" | "shipping" | "discount" | "validation")[];
    records?: { entity: string; id: string }[];
  };
  distribution?: {
    publisher: string;
    keyId: string;
    signature: string;
    channel: "stable" | "beta" | "development";
    dependencies?: { app: string; publisher: string; version: string }[];
  };
  permissions: string[];
  events?: string[];
  eventFilters?: {
    event: string;
    equals: Record<string, string | number | boolean | null>;
  }[];
  eventDelivery?: { url?: string; batchSize: number };
  schedules?: {
    id: string;
    cron: string;
    action: string;
    input: Record<string, unknown>;
    enabled: boolean;
  }[];
  webhooks?: { id: string; action: string }[];
  entities: Entity[];
  slots: { location: string; component: string; label: Text }[];
  actions?: Action[];
  views?: NativeView[];
  surfaces?: Surface[];
  apiRoutes?: { path: string; method: string; scope: string; action: string }[];
  intelligence?: { description: Text; tools: string[]; entities: string[] };
  [key: string]: unknown;
};
export type NativePayload = {
  tenant?: string;
  assetActions?: Partial<
    Record<"assets" | "asset_preview" | "asset_upload", string>
  >;
  lookupActions?: Record<string, string>;
  view: NativeView;
  entities: Entity[];
  navigation?: Record<string, string>;
};
export type AppRecord = {
  id: string;
  revision: number;
  [key: string]: unknown;
};

/** Typed, loop-free UI instructions shared by the visual designer and coding agents. */
export type Expression =
  | { kind: "literal"; value: unknown }
  | { kind: "value"; block: string; field?: string }
  | { kind: "record"; block: string }
  | { kind: "object"; fields: Record<string, Expression> };
export type Statement =
  | { op: "set"; target: string; value: Expression }
  | {
      op: "if";
      left: Expression;
      compare: "eq" | "ne" | "gt" | "ge" | "lt" | "le";
      right: Expression;
      then: Statement[];
      otherwise?: Statement[];
    }
  | { op: "call"; action: string; input: Expression }
  | { op: "msgBox"; text: Text }
  | { op: "navigate"; view: string }
  | { op: "refresh"; target: string }
  | { op: "validate"; target: string };
export const controlKinds = [
  "button",
  "textbox",
  "combobox",
  "checkbox",
  "datepicker",
  "image",
  "frame",
  "tabs",
  "kpi",
  "chart",
] as const;
export function isDataBlock(kind: Block["kind"]) {
  return !["text", "button", "frame", "tabs"].includes(kind);
}
