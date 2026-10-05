/** Locale-aware world catalogue adapter for the shared searchable entity picker. */
import { useInternationalText } from "../i18n/international-i18n";
import EntityPicker from "./EntityPicker";
import { displayName, type Country } from "./geography-types";
export default function CountryPicker({
  countries,
  mainLocale,
  ...props
}: {
  countries: Country[];
  mainLocale?: string;
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
  single?: boolean;
  disabled?: boolean;
}) {
  const { locale } = useInternationalText();
  return (
    <EntityPicker
      {...props}
      options={countries.map((c) => ({
        code: c.code,
        label: displayName(c.name, locale, mainLocale),
        search: [c.alpha3, c.numeric, ...Object.values(c.name)].join(" "),
        group: c.continent,
        subtitle: `${c.alpha3} · ${c.numeric}`,
      }))}
    />
  );
}
