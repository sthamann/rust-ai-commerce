/** Native managed-record form retains revisions and inherited translations; it never executes schema code. */
import { useState } from "react";
import { useAppStudioText } from "../../i18n/app-studio-i18n";
import LocalizedField from "../../i18n/LocalizedField";
import { contentText } from "../../i18n/content-language";
import { useContentLanguage } from "../../i18n/ContentLanguage";
import type { LocalizedText } from "../../i18n/content-language";
import type { AppRecord, Entity } from "./types";
export default function NativeRecordForm({
  entity,
  records,
  save,
  saved,
  boundFields,
}: {
  boundFields?: Record<string, string>;
  entity: Entity;
  records: AppRecord[];
  save: (value: {
    id: string;
    revision: number;
    fields: Record<string, unknown>;
  }) => Promise<void>;
  saved: () => void;
}) {
  const { a, locale } = useAppStudioText();
  const { mainLocale } = useContentLanguage();
  const initial = boundFields ? records[0] : undefined;
  const [selected, setSelected] = useState(initial?.id ?? "");
  const [id, setId] = useState(initial?.id ?? "");
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [fields, setFields] = useState<Record<string, unknown>>({
    ...Object.fromEntries(
      entity.fields
        .filter((f) => initial?.[f.name] != null)
        .map((f) => [f.name, initial![f.name]]),
    ),
    ...boundFields,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(false);
  const setField = (name: string, value: unknown) => {
    setFields({ ...fields, [name]: value });
    setNotice(false);
  };
  return (
    <form
      className="native-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        setNotice(false);
        try {
          await save({ id: id || crypto.randomUUID(), revision, fields });
          setSelected("");
          setId("");
          setRevision(0);
          setFields({});
          setNotice(true);
          saved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!boundFields && (
        <>
          <label>
            {a("record")}
            <select
              value={selected}
              onChange={(e) => {
                const value = records.find((r) => r.id === e.target.value);
                setSelected(e.target.value);
                setId(value?.id ?? "");
                setRevision(value?.revision ?? 0);
                setError("");
                setNotice(false);
                setFields(
                  value
                    ? Object.fromEntries(
                        entity.fields
                          .filter((f) => value[f.name] != null)
                          .map((f) => [f.name, value[f.name]]),
                      )
                    : {},
                );
              }}
            >
              <option value="">{a("newRecord")}</option>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            {a("id")}
            <input
              maxLength={100}
              value={id}
              disabled={!!selected}
              onChange={(e) => setId(e.target.value)}
            />
          </label>
        </>
      )}
      {entity.fields
        .filter((f) => !boundFields || !(f.name in boundFields))
        .map((f) => {
          const label = contentText(f.label, locale, mainLocale) || f.name;
          return f.translatable ? (
            <LocalizedField
              key={f.name}
              label={label}
              value={(fields[f.name] as LocalizedText) ?? {}}
              onChange={(v) => setField(f.name, v)}
              maxLength={2000}
              required={f.required}
              multiline
            />
          ) : (
            <label key={f.name}>
              {label}
              {f.choices?.length ? (
                <select
                  value={String(fields[f.name] ?? "")}
                  required={f.required}
                  onChange={(e) => setField(f.name, e.target.value || null)}
                >
                  <option value="">—</option>
                  {f.choices.map((c) => (
                    <option value={c.value} key={c.value}>
                      {contentText(c.label, locale, mainLocale) || c.value}
                    </option>
                  ))}
                </select>
              ) : f.kind === "boolean" ? (
                <select
                  value={fields[f.name] == null ? "" : String(fields[f.name])}
                  required={f.required}
                  onChange={(e) =>
                    setField(
                      f.name,
                      e.target.value === "" ? null : e.target.value === "true",
                    )
                  }
                >
                  <option value="">—</option>
                  <option value="true">{a("yes")}</option>
                  <option value="false">{a("no")}</option>
                </select>
              ) : f.kind === "json" ? (
                <textarea
                  value={
                    typeof fields[f.name] === "string"
                      ? (fields[f.name] as string)
                      : JSON.stringify(fields[f.name] ?? {}, null, 2)
                  }
                  onChange={(e) => setField(f.name, e.target.value)}
                />
              ) : (
                <input
                  type={f.kind === "integer" ? "number" : "text"}
                  step={f.kind === "integer" ? 1 : undefined}
                  maxLength={2000}
                  required={f.required}
                  value={String(fields[f.name] ?? "")}
                  onChange={(e) =>
                    setField(
                      f.name,
                      f.kind === "integer"
                        ? e.target.value === ""
                          ? null
                          : Number(e.target.value)
                        : e.target.value,
                    )
                  }
                />
              )}
            </label>
          );
        })}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{a("savedRecord")}</p>}
      <button className="studio-primary" disabled={busy}>
        {a(busy ? "loading" : "save")}
      </button>
    </form>
  );
}
