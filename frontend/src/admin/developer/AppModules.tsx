/** Pure server modules edit the same WIT component contract consumed by quotes and checkout; no browser eval or live service code. */
import type { Manifest } from "../../shared/apps/native/types";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
export default function AppModules({
  manifest,
  onChange,
}: {
  manifest: Manifest;
  onChange: (m: Manifest) => void;
}) {
  const { a } = useAppStudioText();
  const c = manifest.commerceHooks;
  const update = (next: NonNullable<Manifest["commerceHooks"]> | undefined) =>
    onChange({
      ...manifest,
      commerceHooks: next,
      permissions: next
        ? [...new Set([...manifest.permissions, "commerce.hooks"])]
        : manifest.permissions.filter((p) => p !== "commerce.hooks"),
    });
  return (
    <section className="app-model-card">
      <header>
        <h2>{a("serverModules")}</h2>
      </header>
      <p>{a("serverModuleHint")}</p>
      <label className="app-check">
        <input
          type="checkbox"
          checked={!!c}
          onChange={(e) =>
            update(
              e.target.checked
                ? { source: "(component)", hooks: ["validation"], records: [] }
                : undefined,
            )
          }
        />
        {a("enableModule")}
      </label>
      {c && (
        <>
          <div className="app-tool-grid">
            {(["price", "shipping", "discount", "validation"] as const).map(
              (h) => (
                <label className="app-check" key={h}>
                  <input
                    type="checkbox"
                    checked={c.hooks.includes(h)}
                    onChange={(e) =>
                      update({
                        ...c,
                        hooks: e.target.checked
                          ? [...c.hooks, h]
                          : c.hooks.filter((k) => k !== h),
                      })
                    }
                  />
                  {a(
                    (
                      {
                        price: "priceHook",
                        shipping: "shippingHook",
                        discount: "discountHook",
                        validation: "validationHook",
                      } as const
                    )[h],
                  )}
                </label>
              ),
            )}
          </div>
          <label>
            {a("componentSource")}
            <textarea
              className="app-source"
              spellCheck={false}
              rows={18}
              maxLength={32768}
              value={c.source}
              onChange={(e) => update({ ...c, source: e.target.value })}
            />
          </label>
          <p>{a("componentLimit")}</p>
          {(c.records ?? []).map((r, i) => (
            <div className="app-connection-row" key={i}>
              <label>
                {a("entity")}
                <select
                  value={r.entity}
                  onChange={(e) =>
                    update({
                      ...c,
                      records: c.records?.map((v, n) =>
                        n === i ? { ...v, entity: e.target.value } : v,
                      ),
                    })
                  }
                >
                  {manifest.entities.map((e) => (
                    <option value={e.name} key={e.name}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {a("id")}
                <input
                  value={r.id}
                  maxLength={100}
                  onChange={(e) =>
                    update({
                      ...c,
                      records: c.records?.map((v, n) =>
                        n === i ? { ...v, id: e.target.value } : v,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  update({
                    ...c,
                    records: c.records?.filter((_, n) => n !== i),
                  })
                }
              >
                {a("delete")}
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={
              !manifest.entities.length || (c.records?.length ?? 0) >= 4
            }
            onClick={() => {
              onChange({
                ...manifest,
                permissions: [
                  ...new Set([...manifest.permissions, "data.read"]),
                ],
                commerceHooks: {
                  ...c,
                  records: [
                    ...(c.records ?? []),
                    { entity: manifest.entities[0].name, id: "" },
                  ],
                },
              });
            }}
          >
            {a("addHostRecord")}
          </button>
        </>
      )}
    </section>
  );
}
