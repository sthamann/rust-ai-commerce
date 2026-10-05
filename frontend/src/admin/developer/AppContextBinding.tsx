/** Native UI bindings connect the open host object to an indexed app field, never to a global JS context. */
import { useAssistantText } from "../../shared/i18n/app-assistant-i18n";
import type { Manifest, Block } from "../../shared/apps/native/types";
import { contextKeys } from "./assistant-model";
export default function AppContextBinding({
  manifest,
  block,
  onChange,
}: {
  manifest: Manifest;
  block: Block;
  onChange: (b: Block) => void;
}) {
  const { t } = useAssistantText(),
    entity = manifest.entities.find((e) => e.name === block.entity);
  return (
    <label className="app-editor-binding">
      {t("binding")}
      <select
        value={block.contextBinding?.field ?? ""}
        onChange={(e) => {
          const f = entity?.fields.find((f) => f.name === e.target.value);
          onChange({
            ...block,
            contextBinding: f?.coreReference
              ? { field: f.name, key: contextKeys[f.coreReference] }
              : null,
          });
        }}
      >
        <option value="">{t("none")}</option>
        {entity?.fields
          .filter((f) => f.coreReference)
          .map((f) => (
            <option key={f.name} value={f.name}>
              {f.name} · {f.coreReference}
            </option>
          ))}
      </select>
    </label>
  );
}
