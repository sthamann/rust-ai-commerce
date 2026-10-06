/** Searchable shop directory and server-validated provisioning form. */
import { storefrontURL } from "../shared/api/shop-scope";
import { useControlText } from "../shared/i18n/control-i18n";
import { useState } from "react";
import { useLocale } from "../shared/i18n/i18n";
import { usePlatformText } from "../shared/i18n/platform-i18n";
import type { Shop, ShopPage } from "./platform-api";
export type NewShop = {
  id: string;
  name: string;
  ownerEmail: string;
  seedCatalog: boolean;
};
export function CreateShop({
  busy,
  onCreate,
  onCancel,
}: {
  busy: boolean;
  onCreate: (body: NewShop) => void;
  onCancel: () => void;
}) {
  const t = usePlatformText();
  const [form, setForm] = useState<NewShop>({
    id: "",
    name: "",
    ownerEmail: "",
    seedCatalog: false,
  });
  return (
    <section className="platform-panel platform-create">
      <h2>{t("create")}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onCreate(form);
        }}
      >
        <label>
          {t("name")}
          <input
            autoFocus
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          {t("id")}
          <input
            required
            pattern="[a-z0-9][a-z0-9-]{0,46}[a-z0-9]"
            minLength={2}
            maxLength={48}
            placeholder="my-shop"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
          />
        </label>
        <label>
          {t("owner")}
          <input
            type="email"
            maxLength={254}
            value={form.ownerEmail}
            onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
          />
          <small>{t("ownerHint")}</small>
        </label>
        <label className="platform-checkbox">
          <input
            type="checkbox"
            checked={form.seedCatalog}
            onChange={(e) =>
              setForm({ ...form, seedCatalog: e.target.checked })
            }
          />
          {t("catalog")}
        </label>
        <p className="platform-note">{t("emptyHint")}</p>
        <div className="platform-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            {t("cancel")}
          </button>
          <button className="platform-primary" disabled={busy}>
            {busy ? t("loading") : t("save")}
          </button>
        </div>
      </form>
    </section>
  );
}
export default function PlatformShops({
  page,
  busy,
  onSearch,
  onMore,
  onDetail,
}: {
  page: ShopPage;
  busy: boolean;
  onSearch: (value: string) => void;
  onMore: () => void;
  onDetail: (shop: Shop) => void;
}) {
  const t = usePlatformText(),
    { number } = useLocale();
  const c = useControlText();
  const [search, setSearch] = useState("");
  return (
    <>
      <form
        className="platform-search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(search);
        }}
      >
        <input
          aria-label={t("search")}
          placeholder={t("search")}
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button disabled={busy}>{t("search")}</button>
      </form>
      <div className="platform-shop-list">
        {page.elements.map((s) => (
          <article key={s.id}>
            <div className="platform-shop-heading">
              <span className="platform-shop-icon">
                {s.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <h2>{s.name}</h2>
                <code>{s.id}</code>{" "}
                <span className={`platform-status ${s.status}`}>
                  {c(s.status)}
                </span>
              </div>
              <button onClick={() => onDetail(s)} disabled={busy}>
                {t("detail")} ↗
              </button>
            </div>
            <div className="platform-shop-stats">
              {[
                ["products", s.products],
                ["customers", s.customers],
                ["orders", s.orders],
                ["team", s.members],
                ["apps", s.apps],
                ["channels", s.salesChannels],
                ["sources", s.knowledgeSources],
              ].map(([key, value]) => (
                <span key={String(key)}>
                  <b>{number(Number(value))}</b>
                  {t(key as "products")}
                </span>
              ))}
            </div>
            <div className="platform-actions">
              <a
                href={s.urls?.storefrontUrl ?? storefrontURL(s.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("open")} ↗
              </a>
              <a
                href={s.urls?.studioUrl ?? storefrontURL(s.id, true)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("studio")} ↗
              </a>
            </div>
          </article>
        ))}
      </div>
      {!page.elements.length && <p>{t("noShops")}</p>}
      {page.hasMore && (
        <button disabled={busy} onClick={onMore}>
          {t("next")}
        </button>
      )}
      <p className="platform-note">{t("operatorScope")}</p>
    </>
  );
}
