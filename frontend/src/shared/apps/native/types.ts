/** The versioned Manifest is the shared intermediate representation for visual and agent edits. */
export type Text = Record<string, string>;
export type Field = {
  name: string;
  label: Text;
  kind: "string" | "integer" | "boolean" | "json";
  translatable?: boolean;
  required?: boolean;
  indexed?: boolean;
  references?: string | null;
};
export type Entity = {
  name: string;
  label: Text;
  fields: Field[];
  publicRead: boolean;
};
export type Block = {
  id: string;
  kind: "text" | "table" | "cards" | "form";
  title: Text;
  text?: Text;
  entity?: string | null;
  readAction?: string | null;
  writeAction?: string | null;
};
export type NativeView = {
  id: string;
  layout: "stack" | "grid";
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
  permissions: string[];
  entities: Entity[];
  slots: { location: string; component: string; label: Text }[];
  actions?: Action[];
  views?: NativeView[];
  surfaces?: Surface[];
  apiRoutes?: { path: string; method: string; scope: string; action: string }[];
  intelligence?: { description: Text; tools: string[]; entities: string[] };
  [key: string]: unknown;
};
export type NativePayload = { view: NativeView; entities: Entity[] };
export type AppRecord = {
  id: string;
  revision: number;
  [key: string]: unknown;
};
