/** Bounded server search selects an owned object for testing editor-bound apps in a private sandbox. */
import { useEffect, useRef, useState } from "react";
import type { RequestFn } from "../../shared/api/types";
import type { Block } from "../../shared/apps/native/types";
import { useAssistantText } from "../../shared/i18n/app-assistant-i18n";
import { contentText } from "../../shared/i18n/content-language";
export default function SandboxContextPicker({
  binding,
  request,
  mainLocale,
  onSelect,
}: {
  binding: NonNullable<Block["contextBinding"]>;
  request: RequestFn;
  mainLocale: string;
  onSelect: (c: Record<string, unknown>) => void;
}) {
  const { t, locale } = useAssistantText(),
    [query, setQuery] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [id, setId] = useState(""),
    [error, setError] = useState("");
  const latest = useRef(request);
  latest.current = request;
  const kind =
    binding.key === "productId"
      ? "products"
      : binding.key === "customerId"
        ? "customers"
        : "orders";
  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      latest
        .current(
          `/api/merchant/${kind}?limit=50&${kind === "products" ? "search" : "query"}=${encodeURIComponent(query)}`,
        )
        .then((v) => {
          if (active) {
            setRows(v.elements ?? []);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [kind, query]);
  return (
    <div className="app-assistant-fields">
      <label>
        {t("findObject")}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={100}
        />
      </label>
      <label>
        {t("object")}
        <select
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            onSelect({ [binding.key]: e.target.value });
          }}
        >
          <option value="">{t("chooseObject")}</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {typeof r.name === "string"
                ? r.name
                : r.name
                  ? contentText(r.name, locale, mainLocale)
                  : (r.orderNumber ?? r.email ?? r.id)}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
