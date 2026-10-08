/** Native managed-record form retains revisions and inherited translations; it never executes schema code. */
import { useEffect, useRef, useState } from "react";
import { useAppStudioText } from "../../i18n/app-studio-i18n";
import { useNativeRuntime } from "./NativeRuntime";
import NativeField from "./NativeField";
import { EditorBuffer } from "../../content/editor/EditorBuffer";
import type { AppRecord, Entity } from "./types";
export default function NativeRecordForm({
  blockId,
  entity,
  records,
  save,
  saved,
  boundFields,
}: {
  blockId?: string;
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
  const { a } = useAppStudioText();
  const runtime = useNativeRuntime(),
    form = useRef<HTMLFormElement>(null);
  const [pendingSource, setPendingSource] = useState(false);
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
  useEffect(() => {
    if (!runtime || !blockId) return;
    return runtime.register(blockId, {
      value: () => {
        const merged = { ...fields, ...boundFields };
        for (const f of entity.fields.filter((f) => f.kind === "json"))
          if (typeof merged[f.name] === "string")
            merged[f.name] = JSON.parse(merged[f.name] as string);
        return { id: id || crypto.randomUUID(), revision, fields: merged };
      },
      validate: () =>
        !pendingSource && !busy && (form.current?.reportValidity() ?? false),
      accepted: (result) => {
        const r = result as { id?: string; revision?: number };
        if (r.id) setId(r.id);
        if (r.revision) setRevision(r.revision);
        setNotice(true);
      },
    });
  }, [
    runtime?.register,
    blockId,
    id,
    revision,
    fields,
    boundFields,
    pendingSource,
    busy,
  ]);
  return (
    <EditorBuffer.Provider
      value={{ pending: pendingSource, setPending: setPendingSource }}
    >
      <form
        ref={form}
        className="native-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || runtime?.busy || pendingSource) return;
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
          .map((f) => (
            <NativeField
              key={f.name}
              field={f}
              value={fields[f.name]}
              onChange={(v) => setField(f.name, v)}
            />
          ))}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{a("savedRecord")}</p>}
        <button
          className="studio-primary"
          disabled={busy || runtime?.busy || pendingSource}
        >
          {a(busy ? "loading" : "save")}
        </button>
      </form>
    </EditorBuffer.Provider>
  );
}
