/** Resolve editable translation keys without merging distinct regional locales or fabricating inherited values. */
export type LocalizedText = Record<string, string | null | undefined>;
export function contentKey(map: object, language: string, locales: string[]) {
  const base = language.split("-")[0];
  return language in map
    ? language
    : base in map &&
        locales.filter((l) => l.split("-")[0] === base).length === 1
      ? base
      : language;
}
export function contentText(
  map: LocalizedText,
  language: string,
  mainLocale: string,
) {
  return (
    map[language] ??
    map[language.split("-")[0]] ??
    map[mainLocale] ??
    map[mainLocale.split("-")[0]] ??
    ""
  );
}
