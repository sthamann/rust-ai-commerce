/** Brand and legal text use one content-language selector and independent language/channel inheritance. */
import { useContentLanguage } from "../../shared/i18n/ContentLanguage";
import LocalizedField from "../../shared/i18n/LocalizedField";
import {
  contentText,
  type LocalizedText,
} from "../../shared/i18n/content-language";
import { useCompanyText } from "../../shared/i18n/company-i18n";
import type { CompanyData } from "./company-types";
export default function CompanyTranslations({
  data,
  base,
  channel,
  onChange,
}: {
  data: CompanyData;
  base: CompanyData;
  channel: boolean;
  onChange: (v: CompanyData) => void;
}) {
  const { co } = useCompanyText(),
    { language, mainLocale } = useContentLanguage();
  return (
    <div className="company-translations">
      {(["brandName", "legalNotice", "responsibilityScope"] as const).map(
        (field) => {
          const own = ((typeof data[field] === "object" && data[field]) ||
            {}) as LocalizedText;
          const basis = (base[field] ?? {}) as LocalizedText;
          const effective = {
            ...basis,
            ...Object.fromEntries(
              Object.entries(own).filter(([, v]) => v != null),
            ),
          };
          const mainOwn = own[mainLocale] ?? own[mainLocale.split("-")[0]];
          const languageBase = basis[language] ?? basis[language.split("-")[0]];
          return (
            <LocalizedField
              key={field}
              label={co(field)}
              value={own}
              multiline={field !== "brandName"}
              maxLength={field === "brandName" ? 500 : 8000}
              externalFallback={
                channel
                  ? contentText(effective, language, mainLocale)
                  : undefined
              }
              externalLabel={
                channel && (languageBase != null || mainOwn == null)
                  ? co("inherited")
                  : undefined
              }
              onChange={(value) => onChange({ ...data, [field]: value })}
            />
          );
        },
      )}
    </div>
  );
}
