/** Published legal text uses selected content language/main-language inheritance; empty content is visible as missing. */
import { useLegalPolicy } from "./PrivacyProvider";
import { useLegalText, type LegalWord } from "../../shared/i18n/legal-i18n";
import { documents } from "../../shared/legal/legal-types";
import { contentText } from "../../shared/i18n/content-language";
import { getContentLocale } from "../../shared/api/shop-api";
export default function LegalDocument({ kind }: { kind: string }) {
  const p = useLegalPolicy(),
    { l } = useLegalText();
  const key = documents.find((d) => d === kind);
  if (!p || !key)
    return (
      <main className="shop-content">
        <p>{l("missing")}</p>
      </main>
    );
  return (
    <main className="shop-content legal-document">
      <span className="legal-eyebrow">{l("documents")}</span>
      <h1>{l(key as LegalWord)}</h1>
      <article>
        {contentText(
          p.data.documents[key] ?? {},
          getContentLocale(),
          p.mainLocale,
        ) || l("missing")}
      </article>
      <small>{p.policyVersion.slice(0, 12)}</small>
    </main>
  );
}
