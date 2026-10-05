/** Shop main language and enabled locales with resumable provider-backed bulk product translation drafts. */
import { useState } from "react";
import { useInternationalText } from "../../shared/i18n/international-i18n";
import type { InternationalProps } from "./CommerceSettings";
import TranslationJobs from "./TranslationJobs";
export default function LanguageSettings({
  config,
  patch,
  request,
  dirty,
  canWrite,
}: InternationalProps & { dirty: boolean; canWrite: boolean }) {
  const { i, locale } = useInternationalText();
  const [next, setNext] = useState("");
  const label = (l: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" }).of(l) ?? l;
    } catch {
      return l;
    }
  };
  return (
    <div className="intl-section">
      <label>
        {i("mainLanguage")}
        <select
          value={config.mainLocale}
          onChange={(e) => patch({ mainLocale: e.target.value })}
        >
          {config.locales.map((l) => (
            <option value={l} key={l}>
              {label(l)} · {l}
            </option>
          ))}
        </select>
      </label>
      <h3>{i("enabledLanguages")}</h3>
      <div className="intl-language-list">
        {config.locales.map((l) => (
          <div key={l}>
            <span>
              <strong>{label(l)}</strong>
              <small>{l}</small>
            </span>
            {l === config.mainLocale ? (
              <span className="soft-tag">{i("mainLanguage")}</span>
            ) : (
              <span>✓</span>
            )}
          </div>
        ))}
      </div>
      <div className="intl-inline">
        <label>
          {i("newLocale")}
          <input
            maxLength={35}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="studio-secondary"
          disabled={
            !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(next) ||
            config.locales.includes(next)
          }
          onClick={() => {
            patch({ locales: [...config.locales, next] });
            setNext("");
          }}
        >
          + {i("add")}
        </button>
      </div>
      {dirty && <p className="intl-coverage">{i("saveFirst")}</p>}
      <TranslationJobs
        request={request}
        config={config}
        disabled={dirty || !canWrite}
      />
    </div>
  );
}
