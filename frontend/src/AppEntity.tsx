/** Managed entity editor renders fields from the installed app contract. */
import { useEffect, useState } from "react";
import { useAppText } from "./app-i18n";
import type { RequestFn } from "./studio-types";
export type Entity = {
  name: string;
  fields: { name: string; kind: string; required: boolean }[];
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
  const { a } = useAppText();
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
        {a("records")} · {a(entity.name)}
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
              .map((f) => `${a(f.name)}: ${r[f.name] ?? "—"}`)
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
            const v = await request(
              `/api/apps/${app}/entities/${entity.name}`,
              { id, revision, fields },
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
            {a(f.name)}
            <input
              type={
                f.kind === "integer"
                  ? "number"
                  : f.kind === "boolean"
                    ? "checkbox"
                    : "text"
              }
              value={
                f.kind === "boolean" ? undefined : String(fields[f.name] ?? "")
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
                        : e.target.value,
                })
              }
            />
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
