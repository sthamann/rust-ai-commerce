/** Reviewable, bounded batch creation uses saved parent data and keeps successful rows on partial failure. */
import { useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import type { ProductDraft } from "./catalog-model";
import {
  variantCombinations,
  variantPayload,
  optionSignature,
  type Axis,
  type VariantRow,
} from "./variant-model";
import { variantFamily } from "./variant-family";
import { useVariantText } from "./variant-i18n";
import { useCatalogText } from "../../shared/i18n/catalog-i18n";
export default function VariantGenerator({
  parent,
  request,
  onCreated,
}: {
  parent: ProductDraft;
  request: RequestFn;
  onCreated: () => Promise<void>;
}) {
  const v = useVariantText(),
    { c } = useCatalogText();
  const [axes, setAxes] = useState<Axis[]>([{ name: "", values: "" }]);
  const [rows, setRows] = useState<VariantRow[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = rows.filter((r) => r.selected && !r.created);
  const valid =
    selected.length > 0 &&
    new Set(selected.map((r) => r.number.trim())).size === selected.length &&
    selected.every(
      (r) =>
        r.number.trim() &&
        r.number.length <= 100 &&
        Number.isFinite(r.price) &&
        r.price >= 0 &&
        Number.isSafeInteger(r.stock) &&
        r.stock >= 0,
    );
  const patchRow = (i: number, patch: Partial<VariantRow>) =>
    setRows((old) => old.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section className="variant-generator">
      <h3>{c("newVariant")}</h3>
      <p>{v("hint")}</p>
      <fieldset disabled={busy}>
        {axes.map((axis, index) => (
          <div className="catalog-form-grid" key={index}>
            <label>
              {v("axis")}
              <input
                maxLength={100}
                value={axis.name}
                onChange={(e) => {
                  setRows([]);
                  setAxes(
                    axes.map((a, i) =>
                      i === index ? { ...a, name: e.target.value } : a,
                    ),
                  );
                }}
              />
            </label>
            <label>
              {v("values")}
              <input
                value={axis.values}
                onChange={(e) => {
                  setRows([]);
                  setAxes(
                    axes.map((a, i) =>
                      i === index ? { ...a, values: e.target.value } : a,
                    ),
                  );
                }}
              />
            </label>
            <button
              type="button"
              className="studio-secondary"
              disabled={axes.length === 1}
              onClick={() => {
                setRows([]);
                setAxes(axes.filter((_, i) => i !== index));
              }}
            >
              {v("remove")}
            </button>
          </div>
        ))}
        <div className="workbench-row">
          <button
            type="button"
            className="studio-secondary"
            disabled={axes.length >= 5}
            onClick={() => setAxes([...axes, { name: "", values: "" }])}
          >
            {v("add")}
          </button>
          <button
            type="button"
            className="studio-secondary"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const combinations = variantCombinations(axes, parent);
                const family = await variantFamily(request, parent.id!);
                const existing = new Map(
                  family.map((child) => [
                    optionSignature(child.options),
                    child,
                  ]),
                );
                const numbers = new Set(
                  family.map((child) => child.productNumber),
                );
                let counter = 1;
                setRows(
                  combinations.map((row) => {
                    const child = existing.get(optionSignature(row.options));
                    if (child)
                      return {
                        ...row,
                        number: child.productNumber,
                        price: child.price,
                        stock: child.stock,
                        selected: false,
                        created: child.id,
                        existing: true,
                      };
                    let number: string;
                    do {
                      number = `${parent.catalog.productNumber.slice(0, 90)}-${counter++}`;
                    } while (numbers.has(number));
                    numbers.add(number);
                    return { ...row, number };
                  }),
                );
              } catch (e) {
                setError(
                  (e as Error).message.includes("10,000")
                    ? v("familyLimit")
                    : v("invalid"),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {v("generate")}
          </button>
        </div>
        {!!rows.length && (
          <div className="variant-table">
            <table>
              <thead>
                <tr>
                  <th>{c("options")}</th>
                  <th>{c("number")}</th>
                  <th>{c("price")}</th>
                  <th>{c("stock")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={
                            v("select") +
                            " " +
                            Object.values(row.options).join(" / ")
                          }
                          disabled={!!row.created}
                          checked={row.selected}
                          onChange={(e) =>
                            patchRow(index, { selected: e.target.checked })
                          }
                        />
                        {Object.values(row.options).join(" / ")}
                        {row.created && (
                          <span className="soft-tag">
                            {v(row.existing ? "existing" : "done")}
                          </span>
                        )}
                      </label>
                    </td>
                    <td>
                      <input
                        aria-label={`${c("number")} ${index + 1}`}
                        disabled={!!row.created}
                        value={row.number}
                        onChange={(e) =>
                          patchRow(index, { number: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${c("price")} ${index + 1}`}
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={!!row.created}
                        value={Number.isFinite(row.price) ? row.price : ""}
                        onChange={(e) =>
                          patchRow(index, { price: e.target.valueAsNumber })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${c("stock")} ${index + 1}`}
                        type="number"
                        min={0}
                        step={1}
                        disabled={!!row.created}
                        value={Number.isFinite(row.stock) ? row.stock : ""}
                        onChange={(e) =>
                          patchRow(index, { stock: e.target.valueAsNumber })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!rows.length && (
          <button
            type="button"
            className="studio-primary"
            disabled={!valid}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                // Re-read saved parent. Unsaved UI fields must never silently become child defaults.
                const saved = await request(
                  `/api/merchant/products/${encodeURIComponent(parent.id!)}`,
                );
                const existing = new Map<string, string>();
                for (const child of await variantFamily(request, parent.id!))
                  existing.set(optionSignature(child.options), child.id);
                for (const [index, row] of rows.entries()) {
                  if (!row.selected || row.created) continue;
                  const found = existing.get(optionSignature(row.options));
                  if (found) {
                    patchRow(index, { created: found, existing: true });
                    continue;
                  }
                  const result = await request(
                    "/api/merchant/products",
                    variantPayload(saved, row),
                    "POST",
                  );
                  patchRow(index, { created: result.id });
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                await onCreated().catch((e) => setError(e.message));
                setBusy(false);
              }
            }}
          >
            {v("create")} ({selected.length})
          </button>
        )}
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
