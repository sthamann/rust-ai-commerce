/** Guided variant creation and editing vocabulary; content still follows shop language inheritance. */
import { useLocale } from "../../shared/i18n/i18n";
const words = {
  existing: ["Already exists", "Bereits vorhanden", "Existe déjà", "Ya existe"],
  familyLimit: [
    "This family exceeds 10,000 variants. Use the product API in batches for this import.",
    "Diese Familie hat mehr als 10.000 Varianten. Nutze für diesen Import die Produkt-API in Batches.",
    "Cette famille dépasse 10 000 variantes. Utilisez l’API produit par lots.",
    "Esta familia supera 10.000 variantes. Usa la API de productos por lotes.",
  ],
  generate: [
    "Generate combinations",
    "Kombinationen erzeugen",
    "Générer les combinaisons",
    "Generar combinaciones",
  ],
  axis: [
    "Option group",
    "Optionsgruppe",
    "Groupe d’options",
    "Grupo de opciones",
  ],
  values: [
    "Values, separated by commas",
    "Werte, durch Kommas getrennt",
    "Valeurs séparées par des virgules",
    "Valores separados por comas",
  ],
  add: [
    "Add option group",
    "Optionsgruppe hinzufügen",
    "Ajouter un groupe",
    "Añadir grupo",
  ],
  create: [
    "Create selected variants",
    "Ausgewählte Varianten anlegen",
    "Créer les variantes sélectionnées",
    "Crear variantes seleccionadas",
  ],
  hint: [
    "Review up to 50 combinations, set each SKU, price and stock. New variants start inactive and can be edited individually.",
    "Prüfe bis zu 50 Kombinationen und passe Artikelnummer, Preis und Bestand an. Neue Varianten starten inaktiv und sind einzeln bearbeitbar.",
    "Vérifiez jusqu’à 50 combinaisons, référence, prix et stock. Les nouvelles variantes sont inactives et modifiables individuellement.",
    "Revisa hasta 50 combinaciones, referencia, precio y existencias. Las variantes nuevas son inactivas y editables individualmente.",
  ],
  invalid: [
    "Use distinct option groups and values; at most 50 combinations. SKUs must be unique; prices and stock must be valid.",
    "Nutze eindeutige Optionsgruppen und Werte, maximal 50 Kombinationen. Artikelnummern müssen eindeutig, Preise und Bestände gültig sein.",
    "Utilisez des groupes et valeurs uniques, 50 combinaisons maximum. Références uniques, prix et stocks valides.",
    "Usa grupos y valores únicos, máximo 50 combinaciones. Referencias únicas, precios y existencias válidos.",
  ],
  parent: [
    "Open parent product",
    "Hauptprodukt öffnen",
    "Ouvrir le produit parent",
    "Abrir producto principal",
  ],
  edit: [
    "Edit variant",
    "Variante bearbeiten",
    "Modifier la variante",
    "Editar variante",
  ],
  more: [
    "Load more variants",
    "Weitere Varianten laden",
    "Charger plus de variantes",
    "Cargar más variantes",
  ],
  select: [
    "Select combination",
    "Kombination auswählen",
    "Sélectionner la combinaison",
    "Seleccionar combinación",
  ],
  remove: [
    "Remove group",
    "Gruppe entfernen",
    "Supprimer le groupe",
    "Eliminar grupo",
  ],
  done: ["Created", "Angelegt", "Créé", "Creado"],
} as const;
export function useVariantText() {
  const { locale } = useLocale();
  return (key: keyof typeof words) =>
    words[key][{ "en-GB": 0, "de-DE": 1, "fr-FR": 2, "es-ES": 3 }[locale]];
}
