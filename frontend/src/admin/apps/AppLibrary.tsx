/** Searchable installed/discovery app cards with category/status filters and real lifecycle actions. */
import { useEffect, useState } from "react";
import type { Package } from "./app-types";
import { useAppText } from "../../shared/i18n/app-i18n";
import { useCustomerText } from "../../shared/i18n/customer-i18n";
import { useEmailText } from "../../shared/i18n/email-i18n";
import { useLibraryText } from "../../shared/i18n/app-library-i18n";
import Icon from "../../shared/ui/Icon";
import AppArtwork from "./AppArtwork";
import {
  appCategory,
  appName,
  appSummary,
  builtIns,
  categories,
  descriptionKey,
  matchesApp,
} from "./library-model";
export default function AppLibrary({
  packages,
  mainLocale,
  loading,
  busy,
  manage,
  onOpen,
  onInstall,
}: {
  packages: Package[];
  mainLocale: string;
  loading: boolean;
  busy: boolean;
  manage: boolean;
  onOpen: (id: string) => void;
  onInstall: (id: string) => void;
}) {
  const { a, locale } = useAppText(),
    { c } = useCustomerText(),
    { e } = useEmailText(),
    l = useLibraryText();
  const [view, setView] = useState("installed"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [state, setState] = useState("all");
  useEffect(() => {
    if (!loading && packages.length === 0) setView("discover");
  }, [loading, packages.length]);
  const name = (b: (typeof builtIns)[number]) =>
    b.id === "engraving"
      ? a("engraving")
      : b.id === "email"
        ? e("title")
        : b.name;
  const available = builtIns.filter(
    (b) =>
      !packages.some((p) => p.id === b.id) ||
      (b.id === "engraving" &&
        packages.some((p) => p.id === b.id && p.version === "1.0.0")),
  );
  const visible = packages.filter((p) =>
    matchesApp(p, query, category, state, locale, mainLocale, l),
  );
  const discovery = available.filter(
    (b) =>
      (category === "all" || b.category === category) &&
      `${b.id} ${name(b)} ${l(descriptionKey(b.id))}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <div className="app-library-summary">
        <span>
          <strong>{packages.length}</strong>
          {l("installed")}
        </span>
        <span>
          <strong>{packages.filter((p) => p.active).length}</strong>
          {l("enabled")}
        </span>
        <span>
          <strong>{available.length}</strong>
          {l("available")}
        </span>
      </div>
      <div className="app-library-toolbar">
        <div className="app-library-switch" role="group" aria-label={a("apps")}>
          {["installed", "discover"].map((k) => (
            <button
              key={k}
              aria-pressed={view === k}
              onClick={() => setView(k)}
            >
              {l(k as "installed" | "discover")}
              <span>
                {k === "installed" ? packages.length : available.length}
              </span>
            </button>
          ))}
        </div>
        <label className="app-library-search">
          <Icon name="search" />
          <input
            type="search"
            aria-label={l("search")}
            placeholder={l("search")}
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />
        </label>
        {view === "installed" && (
          <select
            aria-label={l("allStatuses")}
            value={state}
            onChange={(ev) => setState(ev.target.value)}
          >
            <option value="all">{l("allStatuses")}</option>
            <option value="enabled">{l("enabled")}</option>
            <option value="disabled">{l("disabled")}</option>
          </select>
        )}
      </div>
      <div className="app-categories" role="group" aria-label={c("allApps")}>
        {categories.map((k) => (
          <button
            key={k}
            aria-pressed={category === k}
            onClick={() => setCategory(k)}
          >
            {c(k === "all" ? "allApps" : `${k}Category`)}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="app-library-empty" role="status">
          <Icon name="refresh" />
          {l("loading")}
        </div>
      ) : (
        <>
          <div className="app-catalog">
            {view === "installed"
              ? visible.map((p) => (
                  <button
                    className="app-catalog-card"
                    key={p.id}
                    onClick={() => onOpen(p.id)}
                  >
                    <AppArtwork
                      id={p.id}
                      category={appCategory(p)}
                      {...p.manifest.presentation}
                    />
                    <div className="app-card-content">
                      <div className="app-card-eyebrow">
                        <span>{c(`${appCategory(p)}Category`)}</span>
                        <span className="app-status" data-active={p.active}>
                          {l(p.active ? "enabled" : "disabled")}
                        </span>
                      </div>
                      <h2>{appName(p, locale, mainLocale)}</h2>
                      <p>{appSummary(p, locale, mainLocale, l)}</p>
                      <div className="app-card-footer">
                        <small>{p.version}</small>
                        <strong>
                          {l("configure")}
                          <Icon name="arrow" size={17} />
                        </strong>
                      </div>
                    </div>
                  </button>
                ))
              : discovery.map((b) => (
                  <article className="app-catalog-card" key={b.id}>
                    <AppArtwork id={b.id} category={b.category} />
                    <div className="app-card-content">
                      <div className="app-card-eyebrow">
                        <span>{c(`${b.category}Category`)}</span>
                      </div>
                      <h2>{name(b)}</h2>
                      <p>{l(descriptionKey(b.id))}</p>
                      <button
                        className="studio-secondary app-install-button"
                        disabled={!manage || busy}
                        onClick={() => onInstall(b.id)}
                      >
                        <Icon name="plus" size={16} />
                        {a(
                          packages.some((p) => p.id === b.id)
                            ? "upgrade"
                            : "install",
                        )}
                      </button>
                    </div>
                  </article>
                ))}
          </div>
          {!(view === "installed" ? visible.length : discovery.length) && (
            <div className="app-library-empty">
              <Icon name="search" size={28} />
              <h2>{l("empty")}</h2>
              <button
                className="studio-secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                  setState("all");
                }}
              >
                {l("reset")}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
