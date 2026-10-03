/** Managed entity editor renders fields from the installed app contract. */
import { useEffect, useState } from "react";
import { useAppText } from "./app-i18n";
import type { RequestFn } from "./studio-types";
export type Entity = {
  name: string;
  label?: Record<string, string>;
  fields: {
    name: string;
    label?: Record<string, string>;
    translatable?: boolean;
    kind: string;
    required: boolean;
  }[];
};
export default function AppEntity({
  app,
  entity,
  request,
  canWrite,
}: {
  app: string;
  entity: Entity;
  request: RequestFn;
  canWrite: boolean;
}) {
  const { a, locale } = useAppText();
  const lang = locale.slice(0, 2);
  const label = (v: { name: string; label?: Record<string, string> }) =>
    v.label?.[lang] ?? v.label?.en ?? a(v.name);
  const fieldValue = (f: Entity["fields"][number], value: unknown) =>
    f.translatable && value && typeof value === "object"
      ? ((value as Record<string, string>)[lang] ??
        (value as Record<string, string>).en ??
        "")
      : value;
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [id, setId] = useState("default");
  const [revision, setRevision] = useState(0);
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const v = await request(`/api/apps/${app}/entities/${entity.name}`);
    setRecords(v.elements);
  };
  useEffect(() => {
    let active = true;
    request(`/api/apps/${app}/entities/${entity.name}`)
      .then((v) => {
        if (active) {
          setRecords(v.elements);
          const r = v.elements[0];
          if (r) {
            setId(r.id);
            setRevision(r.revision);
            setFields(
              Object.fromEntries(entity.fields.map((f) => [f.name, r[f.name]])),
            );
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [app, entity.name, request]);
  return (
    <section className="app-entity">
      <h3>
        {a("records")} · {label(entity)}
      </h3>
      <div className="app-records">
        {records.map((r) => (
          <button
            key={String(r.id)}
            onClick={() => {
              setId(String(r.id));
              setRevision(Number(r.revision));
              setFields(
                Object.fromEntries(
                  entity.fields.map((f) => [f.name, r[f.name]]),
                ),
              );
            }}
          >
            {String(r.id)} ·{" "}
            {entity.fields
              .map((f) => `${label(f)}: ${fieldValue(f, r[f.name]) ?? "—"}`)
              .join(" · ")}
          </button>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const values = { ...fields };
            for (const f of entity.fields)
              if (f.kind === "json" && typeof values[f.name] === "string")
                values[f.name] = JSON.parse(values[f.name] as string);
            const v = await request(
              `/api/apps/${app}/entities/${entity.name}`,
              { id, revision, fields: values },
            );
            setRevision(v.revision);
            await load();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {a("recordId")}
          <input
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setRevision(
                (records.find((r) => r.id === e.target.value)
                  ?.revision as number) ?? 0,
              );
            }}
            required
            maxLength={100}
          />
        </label>
        {entity.fields.map((f) => (
          <label key={f.name}>
            {label(f)}
            {f.kind === "json" ? (
              <textarea
                value={
                  typeof fields[f.name] === "string"
                    ? (fields[f.name] as string)
                    : JSON.stringify(fields[f.name] ?? {}, null, 2)
                }
                maxLength={8192}
                required={f.required}
                onChange={(e) =>
                  setFields({ ...fields, [f.name]: e.target.value })
                }
              />
            ) : (
              <input
                type={
                  f.kind === "integer"
                    ? "number"
                    : f.kind === "boolean"
                      ? "checkbox"
                      : "text"
                }
                value={
                  f.kind === "boolean"
                    ? undefined
                    : String(fieldValue(f, fields[f.name]) ?? "")
                }
                checked={
                  f.kind === "boolean" ? Boolean(fields[f.name]) : undefined
                }
                required={f.required && f.kind !== "boolean"}
                maxLength={2000}
                onChange={(e) =>
                  setFields({
                    ...fields,
                    [f.name]:
                      f.kind === "integer"
                        ? Number(e.target.value)
                        : f.kind === "boolean"
                          ? e.target.checked
                          : f.translatable
                            ? {
                                ...(typeof fields[f.name] === "object"
                                  ? (fields[f.name] as Record<string, string>)
                                  : {}),
                                [lang]: e.target.value,
                              }
                            : e.target.value,
                  })
                }
              />
            )}
          </label>
        ))}
        <button className="studio-primary" disabled={!canWrite || busy}>
          {a("save")}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
