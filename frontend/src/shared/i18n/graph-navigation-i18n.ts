/** Saved fact navigation vocabulary; content terms use the editor's shared language inheritance. */
import { useLocale } from "./i18n";
const words = {
  enabled: [
    "Select products from confirmed facts",
    "Produkte über bestätigte Fakten auswählen",
    "Sélectionner les produits par faits confirmés",
    "Seleccionar productos por hechos confirmados",
  ],
  hint: [
    "Adds products with a current public confirmed fact matching this phrase. Manual assignments remain. Source withdrawal removes only fact-based membership; no model runs while browsing.",
    "Ergänzt Produkte mit einem aktuellen, öffentlichen und bestätigten Fakt zur Suchphrase. Manuelle Zuordnungen bleiben. Quellenentzug entfernt nur die Faktenzuordnung; beim Stöbern läuft kein Modell.",
    "Ajoute les produits dont un fait public confirmé et actuel correspond à cette phrase. Les affectations manuelles restent. Le retrait de la source retire seulement cette correspondance ; aucun modèle pendant la navigation.",
    "Añade productos con un hecho público confirmado y actual que coincida con esta frase. Se mantienen las asignaciones manuales. Retirar la fuente elimina solo esta coincidencia; ningún modelo se ejecuta al navegar.",
  ],
  phrase: [
    "Fact phrase",
    "Suchphrase im Fakt",
    "Phrase du fait",
    "Frase del hecho",
  ],
  confidence: [
    "Minimum recorded confidence",
    "Minimale gespeicherte Konfidenz",
    "Confiance enregistrée minimale",
    "Confianza registrada mínima",
  ],
  kind: ["Fact type", "Fakttyp", "Type de fait", "Tipo de hecho"],
  intent: ["Intent", "Bedarf", "Intention", "Intención"],
  problem: ["Problem", "Problem", "Problème", "Problema"],
  occasion: ["Occasion", "Anlass", "Occasion", "Ocasión"],
  audience: ["Audience", "Zielgruppe", "Public", "Público"],
  material: ["Material", "Material", "Matériau", "Material"],
  property: ["Property", "Eigenschaft", "Propriété", "Propiedad"],
} as const;
export function useGraphNavigationText() {
  const { locale } = useLocale();
  const index = locale.startsWith("de")
    ? 1
    : locale.startsWith("fr")
      ? 2
      : locale.startsWith("es")
        ? 3
        : 0;
  return (key: keyof typeof words) => words[key][index];
}
