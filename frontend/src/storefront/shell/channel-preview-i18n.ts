/** Personal preview copy in every supported language; exported through the shared translation catalogue. */
import { useLocale } from "../../shared/i18n/i18n";
const words = {
  title: [
    "Personal merchant preview",
    "Persönliche Händler-Vorschau",
    "Aperçu marchand personnel",
    "Vista previa personal del comerciante",
  ],
  hint: [
    "Visible only through your temporary preview. Orders and account changes are disabled.",
    "Nur über deine zeitlich begrenzte Vorschau sichtbar. Bestellungen und Kontoänderungen sind gesperrt.",
    "Visible uniquement via votre aperçu temporaire. Les commandes et modifications du compte sont désactivées.",
    "Visible solo mediante tu vista previa temporal. Los pedidos y cambios de cuenta están desactivados.",
  ],
  end: [
    "End preview",
    "Vorschau beenden",
    "Terminer l’aperçu",
    "Finalizar vista previa",
  ],
};
export function usePreviewText() {
  const { locale } = useLocale();
  const i = { "en-GB": 0, "de-DE": 1, "fr-FR": 2, "es-ES": 3 }[locale];
  return (key: keyof typeof words) => words[key][i];
}
