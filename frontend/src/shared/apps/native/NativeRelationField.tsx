/** Related records load only through actions already granted to the current surface; no merchant-token side route. */
import { useEffect, useRef, useState } from "react";
import { useNativeRuntime } from "./NativeRuntime";
import { useAppStudioText } from "../../i18n/app-studio-i18n";
import { contentText } from "../../i18n/content-language";
import { useContentLanguage } from "../../i18n/ContentLanguage";
import type { AppRecord, Field } from "./types";
export default function NativeRelationField({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { a, locale } = useAppStudioText(),
    { mainLocale } = useContentLanguage(),
    runtime = useNativeRuntime();
  const lookup = useRef(runtime?.lookup);
  lookup.current = runtime?.lookup;
  const [rows, setRows] = useState<AppRecord[]>([]),
    [cursor, setCursor] = useState<string>(),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError("");
    setRows([]);
    const load = lookup.current
      ? lookup.current(field.references!)
      : Promise.reject(new Error(a("relationUnavailable")));
    load
      .then((v) => {
        if (alive) {
          setRows(v.elements);
          setCursor(v.nextCursor);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [field.references]);
  const selected =
    field.kind === "relations"
      ? Array.isArray(value)
        ? value.map(String)
        : []
      : value
        ? [String(value)]
        : [];
  const title = (row: AppRecord) => {
    const text = row.title ?? row.name;
    return (
      (typeof text === "object" && text
        ? contentText(text as Record<string, string>, locale, mainLocale)
        : typeof text === "string"
          ? text
          : "") || row.id
    );
  };
  const options = rows.filter((row) =>
    `${title(row)} ${row.id}`
      .toLocaleLowerCase(locale)
      .includes(query.toLocaleLowerCase(locale)),
  );
  return (
    <fieldset className="native-relations">
      <legend>
        {contentText(field.label, locale, mainLocale) || field.name}
      </legend>
      <label>
        {a("searchRecords")}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label>
        {a("selectedRecords")}
        <select
          multiple={field.kind === "relations"}
          size={
            field.kind === "relations"
              ? Math.min(6, Math.max(2, options.length))
              : undefined
          }
          value={field.kind === "relations" ? selected : (selected[0] ?? "")}
          required={field.required}
          disabled={busy || !!error}
          onChange={(e) =>
            onChange(
              field.kind === "relations"
                ? Array.from(e.target.selectedOptions).map((o) => o.value)
                : e.target.value || null,
            )
          }
        >
          {field.kind !== "relations" && <option value="">—</option>}
          {selected
            .filter((id) => !options.some((row) => row.id === id))
            .map((id) => (
              <option key={id} value={id}>
                {rows.find((r) => r.id === id)
                  ? title(rows.find((r) => r.id === id)!)
                  : id}
              </option>
            ))}
          {options.map((row) => (
            <option key={row.id} value={row.id}>
              {title(row)}
            </option>
          ))}
        </select>
      </label>
      {cursor && rows.length < 1000 && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const page = await lookup.current!(field.references!, cursor);
              setRows((old) => [
                ...old,
                ...page.elements.filter((r) => !old.some((o) => o.id === r.id)),
              ]);
              setCursor(page.nextCursor);
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
      {busy && <p role="status">{a("loading")}</p>}
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
