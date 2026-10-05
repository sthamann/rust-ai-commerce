/** World catalogue and tenant destination tax contracts; no inferred tax law. */
export type TranslatedText = {
  name?: string | null;
  description?: string | null;
};
export type TextMap = Record<string, TranslatedText>;
export type Region = { code: string; name: Record<string, string> };
export type Country = {
  code: string;
  alpha3: string;
  numeric: string;
  isoAssigned: boolean;
  continent: string;
  name: Record<string, string>;
  states: Region[];
};
export type CountryCatalogue = {
  countries: Country[];
  enabled: string[];
  mainLocale: string;
  locales: string[];
  revision: number;
};
export type DestinationRule = {
  id: string;
  country: string;
  rate: number;
  priority: number;
  states: string[];
  postalCodes: string[];
  postalPrefixes: string[];
  postalFrom: string | null;
  postalTo: string | null;
  activeFrom: string | null;
  activeUntil: string | null;
  condition: unknown | null;
};
export type TaxClass = {
  id: string;
  rates: Record<string, number>;
  defaultRate?: number | null;
  translations?: TextMap;
  rules?: DestinationRule[];
};
export function displayName(
  names: Record<string, string>,
  locale: string,
  main = "en-GB",
) {
  return (
    names[locale] ??
    names[locale.split("-")[0]] ??
    names[main] ??
    names[main.split("-")[0]] ??
    names.en ??
    Object.values(names)[0] ??
    ""
  );
}
export function inheritedText(
  map: TextMap,
  locale: string,
  main: string,
  field: "name" | "description",
) {
  return (
    map[locale]?.[field] ??
    map[locale.split("-")[0]]?.[field] ??
    map[main]?.[field] ??
    map[main.split("-")[0]]?.[field] ??
    ""
  );
}
