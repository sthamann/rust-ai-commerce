/** Exact per-currency decimals live in the same revisioned product draft, including variants. */
import "../../shared/styles/currencies.css";
import { convertDraftPrice } from "../../shared/money/fx-draft";
import { useEffect, useState } from "react";
import type { CurrencyDefinition } from "../../shared/api/shop-api";
import { useCurrencyText } from "../../shared/i18n/currency-i18n";
import type { ProductDraft } from "./catalog-model";
import type { RequestFn } from "../shell/studio-types";
export default function ProductCurrencyPrices({
  draft,
  onChange,
  request,
}: {
  draft: ProductDraft;
  onChange: (v: ProductDraft) => void;
  request: RequestFn;
}) {
  const { c, locale } = useCurrencyText();
  const [definitions, setDefinitions] = useState<CurrencyDefinition[]>([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request("/store-api/currencies")
      .then((v) => {
        if (active) {
          const list = v?.configuredCurrencies ?? v?.availableCurrencies;
          if (!Array.isArray(list)) throw new Error(c("loading"));
          setDefinitions(list);
          setSelected(
            list.find((d: CurrencyDefinition) => d.strategy === "fixed")
              ?.code ?? v.defaultCurrency,
          );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  const prices = draft.extra.currencyPrices ?? {};
  const value = prices[selected];
  const patch = (field: string, text: string) => {
    const entry = { ...value, [field]: text };
    delete entry.generatedAt;
    onChange({
      ...draft,
      extra: {
        ...draft.extra,
        currencyPrices: { ...prices, [selected]: entry },
      },
    });
  };
  return (
    <section className="currency-feed">
      <label>
        {c("priceCurrency")}
        <select
          value={draft.extra.priceCurrency ?? "EUR"}
          onChange={(e) => {
            const code = e.target.value;
            const target = definitions.find((v) => v.code === code);
            const source = definitions.find(
              (v) => v.code === (draft.extra.priceCurrency ?? "EUR"),
            );
            if (!target || !source) return;
            const commerce = { ...draft.commerce };
            for (const key of ["price", "listPrice", "regulationPrice"]) {
              if (commerce[key] != null)
                commerce[key] = convertDraftPrice(
                  commerce[key],
                  source,
                  target,
                );
            }
            onChange({
              ...draft,
              commerce,
              extra: { ...draft.extra, priceCurrency: code },
            });
          }}
        >
          {definitions.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code}
            </option>
          ))}
        </select>
      </label>
      <h2>{c("prices")}</h2>
      {error && <p role="alert">{error}</p>}
      <label>
        {c("select")}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {definitions.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code} ·{" "}
              {new Intl.DisplayNames(locale, { type: "currency" }).of(d.code)}
            </option>
          ))}
        </select>
      </label>
      <p>
        {value
          ? definitions.find((d) => d.code === selected)?.strategy === "fixed"
            ? c("fixed")
            : c("automatic")
          : c("inherited")}
      </p>
      <div className="catalog-form-grid">
        {(["price", "listPrice", "regulationPrice"] as const).map(
          (field, index) => (
            <label key={field}>
              {c((["price", "list", "regulation"] as const)[index])}
              <input
                inputMode="decimal"
                value={value?.[field] ?? ""}
                placeholder={c("inherited")}
                onChange={(e) => patch(field, e.target.value)}
              />
            </label>
          ),
        )}
      </div>
      <button
        type="button"
        className="studio-secondary"
        disabled={!value}
        onClick={() => {
          const next = { ...prices };
          delete next[selected];
          onChange({
            ...draft,
            extra: { ...draft.extra, currencyPrices: next },
          });
        }}
      >
        {c("remove")}
      </button>
    </section>
  );
}
