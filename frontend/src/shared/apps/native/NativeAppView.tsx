/** The same React renderer powers design preview, private sandbox, released admin modules and storefront surfaces. */
import { getContentLocale } from "../../api/shop-api";
import { useState } from "react";
import type { RequestFn } from "../../api/types";
import { useAppStudioText } from "../../i18n/app-studio-i18n";
import {
  ContentLanguage,
  useOptionalContentLanguage,
} from "../../i18n/ContentLanguage";
import ContentLanguagePicker from "../../i18n/ContentLanguagePicker";
import { contentText } from "../../i18n/content-language";
import NativeDataBlock from "./NativeDataBlock";
import type { NativePayload } from "./types";
import "../../styles/native-app.css";
export default function NativeAppView({
  app,
  native,
  request,
  allowedActions,
  mainLocale = "en-GB",
  locales = ["en-GB"],
  public: isPublic = false,
  inheritContentLanguage = false,
  context = {},
}: {
  app: string;
  native: NativePayload;
  request: RequestFn;
  allowedActions: string[];
  mainLocale?: string;
  locales?: string[];
  public?: boolean;
  inheritContentLanguage?: boolean;
  context?: Record<string, unknown>;
}) {
  const parentLanguage = useOptionalContentLanguage();
  // Core product editors may expose unique base-language keys; app records retain configured regional keys.
  const parentKey = parentLanguage?.language;
  const matches = locales.filter(
    (l) => l.split("-")[0] === parentKey?.split("-")[0],
  );
  const inheritedKey =
    parentKey && locales.includes(parentKey)
      ? parentKey
      : matches.length === 1
        ? matches[0]
        : mainLocale;
  const [dataEpoch, setDataEpoch] = useState(0);
  const { locale: interfaceLocale, a } = useAppStudioText();
  const locale = isPublic ? getContentLocale() : interfaceLocale;
  const scoped: RequestFn = (path, body) => {
    const action = path.split("/").at(-1)!;
    if (!allowedActions.includes(action))
      return Promise.reject(new Error(a("invalid")));
    return request(path, body);
  };
  const content = (
    <>
      {!inheritContentLanguage &&
        !isPublic &&
        native.view.blocks.some((b) => b.kind === "form") && (
          <ContentLanguagePicker />
        )}
      <div className={`native-app native-app-${native.view.layout}`}>
        {native.view.blocks.map((b) => {
          const entity = native.entities.find((e) => e.name === b.entity);
          if ((isPublic && b.kind === "form") || (b.kind !== "text" && !entity))
            return null;
          return (
            <section
              className={`native-block native-block-${b.kind}`}
              key={b.id}
            >
              <h3>{contentText(b.title, locale, mainLocale)}</h3>
              {b.kind === "text" ? (
                <p className="native-text">
                  {contentText(b.text ?? {}, locale, mainLocale)}
                </p>
              ) : (
                <NativeDataBlock
                  app={app}
                  block={b}
                  entity={entity!}
                  request={scoped}
                  mainLocale={mainLocale}
                  displayLocale={locale}
                  dataEpoch={b.kind === "form" ? 0 : dataEpoch}
                  context={context}
                  onSaved={() => setDataEpoch((n) => n + 1)}
                />
              )}
            </section>
          );
        })}
      </div>
    </>
  );
  return (
    <ContentLanguage
      locales={locales}
      mainLocale={mainLocale}
      language={inheritContentLanguage ? inheritedKey : undefined}
    >
      {content}
    </ContentLanguage>
  );
}
