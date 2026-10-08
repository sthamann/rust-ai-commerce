/** Core references and typed choice fields remain owned app data with a single content-language editor. */
import LocalizedField from "../../shared/i18n/LocalizedField";
import {
  useAssistantText,
  assistantText,
} from "../../shared/i18n/app-assistant-i18n";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import type { Field } from "../../shared/apps/native/types";
import { textMap, nextId } from "./app-model";
export default function AppFieldOptions({
  field: f,
  onChange,
}: {
  field: Field;
  onChange: (v: Partial<Field>) => void;
}) {
  const { t } = useAssistantText(),
    { a } = useAppStudioText();
  if (f.kind !== "string" || f.translatable || f.references) return null;
  return (
    <div className="app-field-options">
      <label>
        {t("object")}
        <select
          value={f.coreReference ?? ""}
          onChange={(e) =>
            onChange({
              coreReference: (e.target.value || null) as Field["coreReference"],
              indexed: !!e.target.value || f.indexed,
              choices: e.target.value ? [] : f.choices,
            })
          }
        >
          <option value="">{t("none")}</option>
          {["product", "customer", "order"].map((k) => (
            <option value={k} key={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      {!f.coreReference && (
        <>
          <span>{t("choices")}</span>
          {f.choices?.map((c, i) => (
            <div className="app-choice-row" key={i}>
              <label>
                {a("id")}
                <input
                  value={c.value}
                  maxLength={32}
                  onChange={(e) =>
                    onChange({
                      choices: f.choices?.map((x, n) =>
                        n === i ? { ...x, value: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <LocalizedField
                label={a("title")}
                value={c.label}
                required
                maxLength={100}
                onChange={(v) =>
                  onChange({
                    choices: f.choices?.map((x, n) =>
                      n === i ? { ...x, label: textMap(v) } : x,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="app-icon-button"
                aria-label={a("delete")}
                onClick={() =>
                  onChange({ choices: f.choices?.filter((_, n) => n !== i) })
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="studio-secondary"
            disabled={(f.choices?.length ?? 0) >= 100}
            onClick={() =>
              onChange({
                choices: [
                  ...(f.choices ?? []),
                  {
                    value: nextId(
                      "option",
                      f.choices?.map((c) => c.value) ?? [],
                    ),
                    label: assistantText("choice"),
                  },
                ],
              })
            }
          >
            {t("addChoice")}
          </button>
        </>
      )}
    </div>
  );
}
