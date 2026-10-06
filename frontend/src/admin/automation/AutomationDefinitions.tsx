/** Searchable, explicitly editable definitions with visible active state and version. */
import { useState } from "react";
import type { Config } from "./automation-types";
import { contentText } from "../../shared/i18n/content-language";
import { useLocale } from "../../shared/i18n/i18n";
import { useLifecycleText } from "./lifecycle-i18n";
export default function AutomationDefinitions({
  rows,
  id,
  mainLocale,
  onSelect,
  onCreate,
  manage,
}: {
  rows: Config[];
  id: string;
  mainLocale: string;
  onSelect: (r: Config) => void;
  onCreate: () => void;
  manage: boolean;
}) {
  const t = useLifecycleText(),
    { locale } = useLocale(),
    [search, setSearch] = useState("");
  const visible = rows.filter((r) =>
    `${r.id} ${contentText(r.data.name ?? {}, locale, mainLocale)}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  return (
    <section className="studio-card automation-definitions">
      <button className="studio-primary" disabled={!manage} onClick={onCreate}>
        + {t("create")}
      </button>
      <label>
        {t("search")}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {!visible.length && <p className="muted">{t("empty")}</p>}
      {visible.map((r) => (
        <button
          key={r.id}
          className="automation-definition"
          aria-pressed={r.id === id}
          onClick={() => onSelect(r)}
        >
          <strong>
            {contentText(r.data.name ?? {}, locale, mainLocale) || r.id}
          </strong>
          <span className="automation-definition-meta">
            <span>{t(r.data.active ? "active" : "inactive")}</span>
            <span>
              {t("edit")} ↗ · {t("version")} {r.revision}
            </span>
          </span>
        </button>
      ))}
    </section>
  );
}
