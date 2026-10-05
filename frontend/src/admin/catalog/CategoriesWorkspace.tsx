/** Localized category tree editor; parent moves and revisions are validated in the API. */
import { useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import { useCatalogText } from "./catalog-i18n";
import { languages, type Category } from "./catalog-model";
export function orderedCategories(
  categories: Category[],
  parent: string | null = null,
  depth = 0,
): { category: Category; depth: number }[] {
  return depth > 20
    ? []
    : categories
        .filter((c) => c.parentId === parent)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .flatMap((category) => [
          { category, depth },
          ...orderedCategories(categories, category.id, depth + 1),
        ]);
}
export default function CategoriesWorkspace({
  request,
  categories,
  onRefresh,
}: {
  request: RequestFn;
  categories: Category[];
  onRefresh: () => void;
}) {
  const { c, locale } = useCatalogText();
  const [lang, setLang] = useState(locale.slice(0, 2));
  const [selected, setSelected] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const edit = (v: Category) => {
    setSelected(v);
    setSaved(false);
  };
  const tr = selected?.data.translations[lang] ?? {
    name: "",
    description: "",
    slug: "",
  };
  return (
    <div className="catalog-category-layout">
      <section className="studio-card catalog-category-tree">
        <div className="catalog-heading">
          <h2>{c("categories")}</h2>
          <button
            className="studio-secondary"
            onClick={() =>
              edit({
                id: "",
                revision: 0,
                parentId: categories.some((c) => c.id === "catalog-root")
                  ? "catalog-root"
                  : null,
                position: 0,
                data: {
                  active: false,
                  visible: true,
                  type: "page",
                  translations: Object.fromEntries(
                    languages.map((l) => [
                      l,
                      { name: "", description: "", slug: "" },
                    ]),
                  ),
                },
              })
            }
          >
            + {c("newCategory")}
          </button>
        </div>
        {orderedCategories(categories).map(({ category, depth }) => (
          <button
            className="catalog-tree-node"
            aria-pressed={selected?.id === category.id}
            key={category.id}
            style={{ paddingInlineStart: `${16 + depth * 18}px` }}
            onClick={() => edit(structuredClone(category))}
          >
            <span>
              ▱{" "}
              {category.data.translations[locale.slice(0, 2)]?.name ??
                category.data.translations.en.name}
            </span>
            <small>{c(category.data.active ? "active" : "inactive")}</small>
          </button>
        ))}
      </section>
      <section className="studio-card catalog-category-editor">
        {!selected ? (
          <p>{c("categoryHint")}</p>
        ) : (
          <>
            <h2>{selected.id ? tr.name : c("newCategory")}</h2>
            <div className="catalog-form-grid">
              <label>
                {c("language")}
                <select value={lang} onChange={(e) => setLang(e.target.value)}>
                  {languages.map((l) => (
                    <option key={l} value={l}>
                      {l.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {c("name")}
                <input
                  value={tr.name}
                  maxLength={200}
                  onChange={(e) =>
                    edit({
                      ...selected,
                      data: {
                        ...selected.data,
                        translations: {
                          ...selected.data.translations,
                          [lang]: { ...tr, name: e.target.value },
                        },
                      },
                    })
                  }
                />
              </label>
              <label>
                {c("parent")}
                <select
                  value={selected.parentId ?? ""}
                  onChange={(e) =>
                    edit({ ...selected, parentId: e.target.value || null })
                  }
                >
                  <option value="">{c("root")}</option>
                  {orderedCategories(categories)
                    .filter(({ category }) => category.id !== selected.id)
                    .map(({ category, depth }) => (
                      <option key={category.id} value={category.id}>
                        {"—".repeat(depth)}{" "}
                        {category.data.translations[lang]?.name ??
                          category.data.translations.en.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {c("position")}
                <input
                  type="number"
                  value={selected.position}
                  onChange={(e) =>
                    edit({ ...selected, position: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                {c("type")}
                <select
                  value={selected.data.type}
                  onChange={(e) =>
                    edit({
                      ...selected,
                      data: { ...selected.data, type: e.target.value },
                    })
                  }
                >
                  {["page", "folder", "link"].map((t) => (
                    <option key={t} value={t}>
                      {c(
                        t === "folder" ? "structuring" : (t as "page" | "link"),
                      )}
                    </option>
                  ))}
                </select>
              </label>
              {selected.data.type === "link" && (
                <label>
                  {c("url")}
                  <input
                    value={selected.data.url ?? ""}
                    onChange={(e) =>
                      edit({
                        ...selected,
                        data: { ...selected.data, url: e.target.value },
                      })
                    }
                  />
                </label>
              )}
              <label>
                {c("slug")}
                <input
                  value={tr.slug ?? ""}
                  maxLength={200}
                  onChange={(e) =>
                    edit({
                      ...selected,
                      data: {
                        ...selected.data,
                        translations: {
                          ...selected.data.translations,
                          [lang]: { ...tr, slug: e.target.value },
                        },
                      },
                    })
                  }
                />
              </label>
              <label className="catalog-span">
                {c("description")}
                <textarea
                  value={tr.description ?? ""}
                  rows={4}
                  maxLength={4000}
                  onChange={(e) =>
                    edit({
                      ...selected,
                      data: {
                        ...selected.data,
                        translations: {
                          ...selected.data.translations,
                          [lang]: { ...tr, description: e.target.value },
                        },
                      },
                    })
                  }
                />
              </label>
            </div>
            <div className="catalog-flags">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selected.data.displayNestedProducts !== false}
                  onChange={(e) =>
                    edit({
                      ...selected,
                      data: {
                        ...selected.data,
                        displayNestedProducts: e.target.checked,
                      },
                    })
                  }
                />
                {c("nested")}
              </label>
              {(["active", "visible"] as const).map((k) => (
                <label className="checkbox-label" key={k}>
                  <input
                    type="checkbox"
                    checked={selected.data[k]}
                    onChange={(e) =>
                      edit({
                        ...selected,
                        data: { ...selected.data, [k]: e.target.checked },
                      })
                    }
                  />
                  {c(k)}
                </label>
              ))}
            </div>
            {error && <p role="alert">{error}</p>}
            {saved && <p role="status">{c("saved")}</p>}
            <button
              className="studio-primary"
              disabled={busy || !tr.name.trim()}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const translations = { ...selected.data.translations };
                  for (const l of languages)
                    translations[l] = {
                      ...translations[l],
                      name: translations[l].name.trim() || tr.name,
                    };
                  const v = await request(
                    selected.id
                      ? `/api/merchant/categories/${selected.id}`
                      : "/api/merchant/categories",
                    {
                      revision: selected.id ? selected.revision : null,
                      parentId: selected.parentId,
                      position: selected.position,
                      data: { ...selected.data, translations },
                    },
                    selected.id ? "PUT" : "POST",
                  );
                  setSelected({
                    ...selected,
                    id: v.id,
                    revision: v.revision,
                    data: { ...selected.data, translations },
                  });
                  setSaved(true);
                  onRefresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {c(busy ? "saving" : "saveCategory")}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
