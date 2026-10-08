/** Native asset editors use the existing asset owner; generated actions remain explicit capabilities in the package. */
import type { Manifest, Action } from "../../shared/apps/native/types";
export const assetActions: Action[] = [
  {
    name: "assets",
    description: "List tenant-owned files",
    handler: "assets",
    public: false,
    readOnly: true,
    permission: "catalog.read",
    inputSchema: {
      type: "object",
      properties: { productId: { type: "string" }, after: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "preview_asset",
    description: "Preview a tenant-owned image",
    handler: "asset_preview",
    public: false,
    readOnly: true,
    permission: "catalog.read",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, productId: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "upload_asset",
    description:
      "Upload a private file through the existing product asset store",
    handler: "asset_upload",
    mcp: false,
    public: false,
    readOnly: false,
    permission: "catalog.write",
    inputSchema: {
      type: "object",
      properties: { productId: { type: "string" } },
      required: ["productId"],
      additionalProperties: false,
    },
  },
];
export function addAssetActions(m: Manifest) {
  if (
    !m.entities.some((e) =>
      e.fields.some((f) => ["image", "file"].includes(f.kind)),
    )
  )
    return;
  m.permissions = [
    ...new Set([...m.permissions, "assets.read", "assets.write"]),
  ];
  for (const action of assetActions)
    if (!m.actions?.some((a) => a.handler === action.handler))
      (m.actions ??= []).push(action);
}
