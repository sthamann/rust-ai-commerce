/** Typed VB-style controls read app records; edits stay local until an explicitly bound gateway action runs. */
import { useEffect, useState } from "react";
import type { AppRecord, Block, Entity } from "./types";
import { useNativeRuntime } from "./NativeRuntime";
import NativeField from "./NativeField";
import { useAppStudioText } from "../../i18n/app-studio-i18n";
import { contentText } from "../../i18n/content-language";
export default function NativeControl({
  block,
  entity,
  records,
  locale,
  mainLocale,
  tenant,
}: {
  tenant?: string;
  block: Block;
  entity: Entity;
  records: AppRecord[];
  locale: string;
  mainLocale: string;
}) {
  const { a } = useAppStudioText();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [records, block.dataField]);
  const runtime = useNativeRuntime(),
    [active, setActive] = useState(0);
  const f = entity.fields.find((f) => f.name === block.dataField);
  const first = records[active] ?? records[0],
    stored = first?.[block.dataField ?? ""];
  useEffect(() => {
    if (
      f &&
      ["textbox", "combobox", "checkbox", "datepicker"].includes(block.kind) &&
      runtime?.values[block.id] === undefined &&
      stored !== undefined
    )
      runtime?.set(block.id, stored);
  }, [stored, block.id]);
  if (!f) return null;
  if (["textbox", "combobox", "checkbox", "datepicker"].includes(block.kind))
    return (
      <NativeField
        field={f}
        value={runtime?.values[block.id] ?? stored}
        onChange={(v) => {
          runtime?.set(block.id, v);
          void runtime?.run(block.handlers?.change ?? []);
        }}
      />
    );
  const display = (r?: AppRecord) => {
    const value = r?.[f.name];
    if (f.kind === "money" && value && typeof value === "object") {
      const money = value as {
        minor: number;
        currency: { code: string; scale: number };
      };
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: money.currency.code,
        minimumFractionDigits: money.currency.scale,
        maximumFractionDigits: money.currency.scale,
      }).format(money.minor / 10 ** money.currency.scale);
    }
    return f.translatable
      ? contentText((value ?? {}) as Record<string, string>, locale, mainLocale)
      : String(value ?? "—");
  };
  if (block.kind === "kpi")
    return <strong className="native-kpi">{display(first)}</strong>;
  if (block.kind === "chart") {
    const values = records.map((r) => Number(r[f.name])),
      max = Math.max(1, ...values.filter(Number.isFinite).map(Math.abs));
    return (
      <div className="native-chart">
        {records.map((r, i) => (
          <div key={r.id}>
            <small>{r.id}</small>
            <meter
              min={0}
              max={max}
              value={Number.isFinite(values[i]) ? Math.max(0, values[i]) : 0}
            />
            <span>{display(r)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (block.kind === "image")
    return (
      <figure className="native-asset-reference">
        {failed || !stored ? (
          <figcaption>{a("assetUnavailable")}</figcaption>
        ) : (
          <img
            src={`/store-api/assets/${encodeURIComponent(String(stored))}${tenant ? `?shop=${encodeURIComponent(tenant)}` : ""}`}
            alt={contentText(block.title, locale, mainLocale)}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )}
        {records.length > 1 && (
          <select
            value={active}
            onChange={(e) => setActive(Number(e.target.value))}
          >
            {records.map((r, i) => (
              <option key={r.id} value={i}>
                {r.id}
              </option>
            ))}
          </select>
        )}
      </figure>
    );
  return null;
}
