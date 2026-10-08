/** One bounded keyset page per mounted data block; action requests remain tenant- and permission-scoped. */
import { Fragment } from "react";
import { useEffect, useRef, useState } from "react";
import type { RequestFn } from "../../api/types";
import { useAppStudioText } from "../../i18n/app-studio-i18n";
import { contentText } from "../../i18n/content-language";
import NativeControl from "./NativeControl";
import { useNativeRuntime } from "./NativeRuntime";
import NativeRecordForm from "./NativeRecordForm";
import type { AppRecord, Block, Entity, Text } from "./types";
export default function NativeDataBlock({
  app,
  block,
  entity,
  request,
  mainLocale,
  displayLocale,
  dataEpoch = 0,
  onSaved,
  context = {},
  tenant,
}: {
  tenant?: string;
  app: string;
  block: Block;
  entity: Entity;
  request: RequestFn;
  mainLocale: string;
  displayLocale?: string;
  dataEpoch?: number;
  onSaved?: () => void;
  context?: Record<string, unknown>;
}) {
  const runtime = useNativeRuntime();
  dataEpoch += runtime?.epochs[block.id] ?? 0;
  const bound = block.contextBinding;
  const reference = bound ? context[bound.key] : undefined;
  const filter =
    bound && typeof reference === "string" && reference
      ? { [bound.field]: reference }
      : undefined;
  const missingContext = !!bound && !filter;
  const { a, locale: interfaceLocale } = useAppStudioText();
  const locale = displayLocale ?? interfaceLocale;
  const [records, setRecords] = useState<AppRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [epoch, setEpoch] = useState(0),
    [editing, setEditing] = useState("");
  const saveRecord = async (value: {
    id: string;
    revision: number;
    fields: Record<string, unknown>;
  }) => {
    const fields = { ...value.fields };
    for (const f of entity.fields.filter((f) => f.kind === "json"))
      if (typeof fields[f.name] === "string")
        fields[f.name] = JSON.parse(fields[f.name] as string);
    return current.current(`/api/apps/${app}/actions/${block.writeAction}`, {
      ...value,
      fields,
    });
  };
  const current = useRef(request);
  current.current = request;
  useEffect(() => {
    let active = true;
    if (missingContext) {
      setRecords([]);
      setCursor(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    setError("");
    setRecords([]);
    setEditing("");
    setCursor(null);
    current
      .current(`/api/apps/${app}/actions/${block.readAction}`, {
        limit: 50,
        ...(filter ? { filter } : {}),
      })
      .then((v) => {
        if (active) {
          setRecords(v.elements);
          setCursor(v.nextCursor ?? null);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [
    app,
    block.readAction,
    epoch,
    dataEpoch,
    JSON.stringify(filter),
    missingContext,
  ]);
  const visibleFields = entity.fields.filter((f) => f.name !== bound?.field);
  const cell = (r: AppRecord, name: string) => {
    const f = entity.fields.find((f) => f.name === name)!;
    const v = r[name];
    const choice = f.choices?.find((c) => c.value === v);
    if (choice)
      return contentText(choice.label, locale, mainLocale) || choice.value;
    return f.translatable
      ? contentText((v ?? {}) as Text, locale, mainLocale)
      : typeof v === "boolean"
        ? a(v ? "yes" : "no")
        : v == null
          ? "—"
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v);
  };
  if (missingContext) return <p role="status">{a("contextRequired")}</p>;
  return (
    <div className="native-data">
      <div className="native-data-status">
        <span>
          {busy
            ? a("loading")
            : `${records.length} · ${contentText(entity.label, locale, mainLocale)}`}
        </span>
        <button
          type="button"
          className="studio-secondary"
          disabled={busy}
          onClick={() => setEpoch((x) => x + 1)}
        >
          {a("refresh")}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {block.kind === "form" ? (
        !busy &&
        !error && (
          <NativeRecordForm
            key={`${app}:${entity.name}:${epoch}:${dataEpoch}`}
            blockId={block.id}
            entity={entity}
            records={records}
            boundFields={filter}
            saved={() => {
              setEpoch((x) => x + 1);
              onSaved?.();
            }}
            save={saveRecord}
          />
        )
      ) : block.kind === "table" ? (
        <div className="native-table-scroll">
          <table>
            <thead>
              <tr>
                {block.inlineEdit && <th>{a("edit")}</th>}
                {visibleFields.map((f) => (
                  <th key={f.name}>
                    {contentText(f.label, locale, mainLocale) || f.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    {block.inlineEdit && (
                      <td>
                        <button
                          type="button"
                          className="studio-secondary"
                          disabled={busy || runtime?.busy}
                          onClick={() =>
                            setEditing(editing === r.id ? "" : r.id)
                          }
                        >
                          {a(editing === r.id ? "cancel" : "edit")}
                        </button>
                      </td>
                    )}
                    {visibleFields.map((f) => (
                      <td key={f.name}>{cell(r, f.name)}</td>
                    ))}
                  </tr>
                  {block.inlineEdit && editing === r.id && (
                    <tr>
                      <td colSpan={visibleFields.length + 1}>
                        <NativeRecordForm
                          key={`${r.id}:${r.revision}`}
                          entity={entity}
                          records={[r]}
                          boundFields={filter ?? {}}
                          save={saveRecord}
                          saved={() => {
                            setEditing("");
                            setEpoch((x) => x + 1);
                            onSaved?.();
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : block.kind !== "cards" ? (
        <NativeControl
          block={block}
          entity={entity}
          records={records}
          locale={locale}
          mainLocale={mainLocale}
          tenant={tenant}
        />
      ) : (
        <div className="native-cards">
          {records.map((r) => (
            <article key={r.id}>
              {visibleFields.map((f) => (
                <div key={f.name}>
                  <small>
                    {contentText(f.label, locale, mainLocale) || f.name}
                  </small>
                  <p>{cell(r, f.name)}</p>
                </div>
              ))}
            </article>
          ))}
        </div>
      )}
      {!busy && !records.length && block.kind !== "form" && (
        <p className="muted">{a("empty")}</p>
      )}
      {cursor && (
        <button
          className="studio-secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const v = await current.current(
                `/api/apps/${app}/actions/${block.readAction}`,
                { limit: 50, after: cursor, ...(filter ? { filter } : {}) },
              );
              setRecords(v.elements);
              setCursor(v.nextCursor ?? null);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {a("more")}
        </button>
      )}
    </div>
  );
}
