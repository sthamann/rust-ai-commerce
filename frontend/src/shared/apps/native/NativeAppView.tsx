/** The same React renderer powers design preview, private sandbox, released admin modules and storefront surfaces. */
import { getContentLocale } from "../../api/shop-api";
import NativeRuntime from "./NativeRuntime";
import NativeBlocks from "./NativeBlocks";
import type { RequestFn } from "../../api/types";
import { useAppStudioText } from "../../i18n/app-studio-i18n";
import {
  ContentLanguage,
  useOptionalContentLanguage,
} from "../../i18n/ContentLanguage";
import ContentLanguagePicker from "../../i18n/ContentLanguagePicker";

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
  debug = false,
}: {
  debug?: boolean;
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
        native.view.blocks.some((b) => b.kind === "form" || b.inlineEdit) && (
          <ContentLanguagePicker />
        )}
      <NativeRuntime
        app={app}
        native={native}
        request={scoped}
        locale={locale}
        mainLocale={mainLocale}
        debug={debug}
        context={context}
      >
        <NativeBlocks
          app={app}
          native={native}
          request={scoped}
          locale={locale}
          mainLocale={mainLocale}
          isPublic={isPublic}
          context={context}
        />
      </NativeRuntime>
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
