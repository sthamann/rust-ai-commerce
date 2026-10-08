/** Four-language controls for visual/Markdown editing without changing content-language inheritance. */
import { useLocale } from "../../i18n/i18n";
const words = {
  reset: [
    "Discard source changes",
    "Quelltextänderungen verwerfen",
    "Abandonner les modifications de source",
    "Descartar cambios de fuente",
  ],
  apply: [
    "Apply Markdown",
    "Markdown übernehmen",
    "Appliquer le Markdown",
    "Aplicar Markdown",
  ],
  pending: [
    "Source changes are a draft. Apply them before saving the product.",
    "Quelltextänderungen sind ein Entwurf. Übernimm sie vor dem Speichern des Produkts.",
    "Les modifications sont un brouillon. Appliquez-les avant d’enregistrer le produit.",
    "Los cambios son un borrador. Aplícalos antes de guardar el producto.",
  ],
  visual: [
    "Visual editor",
    "Visueller Editor",
    "Éditeur visuel",
    "Editor visual",
  ],
  markdown: ["Markdown", "Markdown", "Markdown", "Markdown"],
  source: [
    "Markdown source",
    "Markdown-Quelltext",
    "Source Markdown",
    "Fuente Markdown",
  ],
  hint: [
    "Write Markdown or use the visual editor. Both edit the same description.",
    "Schreibe Markdown oder nutze den visuellen Editor. Beide bearbeiten dieselbe Beschreibung.",
    "Écrivez en Markdown ou utilisez l’éditeur visuel. Les deux modifient la même description.",
    "Escribe Markdown o usa el editor visual. Ambos editan la misma descripción.",
  ],
  unsupported: [
    "This description contains formatting that Markdown cannot preserve. Keep using the visual editor.",
    "Diese Beschreibung enthält Formatierungen, die Markdown nicht erhalten kann. Nutze den visuellen Editor.",
    "Cette description contient une mise en forme que Markdown ne peut pas préserver. Utilisez l’éditeur visuel.",
    "Esta descripción contiene formato que Markdown no puede conservar. Usa el editor visual.",
  ],
  invalid: [
    "Unsupported content or unsafe link. Correct the Markdown before saving.",
    "Nicht unterstützter Inhalt oder unsicherer Link. Korrigiere den Markdown-Text vor dem Speichern.",
    "Contenu non pris en charge ou lien non sûr. Corrigez le Markdown avant d’enregistrer.",
    "Contenido no compatible o enlace inseguro. Corrige el Markdown antes de guardar.",
  ],
  quote: ["Quote", "Zitat", "Citation", "Cita"],
  code: ["Code block", "Codeblock", "Bloc de code", "Bloque de código"],
  divider: ["Divider", "Trennlinie", "Séparateur", "Separador"],
  strike: ["Strikethrough", "Durchgestrichen", "Barré", "Tachado"],
} as const;
export function useEditorText() {
  const { locale } = useLocale();
  const index = { "en-GB": 0, "de-DE": 1, "fr-FR": 2, "es-ES": 3 }[locale];
  return (key: keyof typeof words) => words[key][index];
}
