/** Product safety and sector facts in EN/DE/FR/ES; values follow the shared content-language inheritance. */
import { useLocale } from "./i18n";
export const productLegalWords = {
  manufacturer: ["Manufacturer", "Hersteller", "Fabricant", "Fabricante"],
  manufacturerAddress: [
    "Manufacturer postal address",
    "Postanschrift des Herstellers",
    "Adresse postale du fabricant",
    "Dirección postal del fabricante",
  ],
  manufacturerContact: [
    "Manufacturer electronic contact",
    "Elektronischer Herstellerkontakt",
    "Contact électronique du fabricant",
    "Contacto electrónico del fabricante",
  ],
  responsiblePerson: [
    "EU responsible person",
    "EU-verantwortliche Person",
    "Responsable dans l’UE",
    "Responsable en la UE",
  ],
  responsibleAddress: [
    "EU responsible person address",
    "Anschrift des EU-Verantwortlichen",
    "Adresse du responsable UE",
    "Dirección del responsable UE",
  ],
  responsibleContact: [
    "EU responsible electronic contact",
    "Elektronischer Kontakt des EU-Verantwortlichen",
    "Contact électronique du responsable UE",
    "Contacto electrónico del responsable UE",
  ],
  identifier: [
    "Product identification / type",
    "Produktidentifikation / Typ",
    "Identification / type du produit",
    "Identificación / tipo de producto",
  ],
  warnings: [
    "Warnings & safety information",
    "Warn- & Sicherheitshinweise",
    "Avertissements et sécurité",
    "Advertencias y seguridad",
  ],
  fibres: [
    "Fibre composition & animal-origin parts",
    "Faserzusammensetzung & tierische Bestandteile",
    "Fibres et parties d’origine animale",
    "Fibras y partes de origen animal",
  ],
  ingredients: [
    "Ingredients / INCI",
    "Zutaten / INCI",
    "Ingrédients / INCI",
    "Ingredientes / INCI",
  ],
  allergens: ["Allergens", "Allergene", "Allergènes", "Alérgenos"],
  nutrition: [
    "Nutrition information",
    "Nährwertinformationen",
    "Informations nutritionnelles",
    "Información nutricional",
  ],
  netQuantity: [
    "Net quantity",
    "Nettofüllmenge",
    "Quantité nette",
    "Cantidad neta",
  ],
  foodOperator: [
    "Food business operator & address",
    "Lebensmittelunternehmer & Anschrift",
    "Exploitant alimentaire et adresse",
    "Operador alimentario y dirección",
  ],
  origin: [
    "Origin / provenance",
    "Ursprung / Herkunft",
    "Origine / provenance",
    "Origen / procedencia",
  ],
  instructions: [
    "Instructions & precautions",
    "Anleitung & Vorsichtsmaßnahmen",
    "Instructions et précautions",
    "Instrucciones y precauciones",
  ],
  energyLabelUrl: [
    "Energy label URL",
    "Energielabel-URL",
    "URL de l’étiquette énergétique",
    "URL de etiqueta energética",
  ],
  energySheetUrl: [
    "Product information sheet URL",
    "Produktdatenblatt-URL",
    "URL de fiche produit",
    "URL de ficha de producto",
  ],
  registration: [
    "Registrations / conformity references",
    "Registrierungen / Konformitätsnachweise",
    "Inscriptions / références de conformité",
    "Registros / referencias de conformidad",
  ],
  ageVerification: [
    "Age verification & delivery procedure",
    "Altersprüfung & Lieferverfahren",
    "Vérification d’âge et livraison",
    "Verificación de edad y entrega",
  ],
  compatibility: [
    "Digital functionality & compatibility",
    "Digitale Funktion & Kompatibilität",
    "Fonctionnalité et compatibilité numérique",
    "Funcionalidad y compatibilidad digital",
  ],
  nonEuManufacturer: [
    "Manufacturer outside the EU",
    "Hersteller außerhalb der EU",
    "Fabricant hors UE",
    "Fabricante fuera de la UE",
  ],
} as const;
export const productLegalFields = Object.keys(productLegalWords).filter(
  (k) => k !== "nonEuManufacturer",
) as Exclude<keyof typeof productLegalWords, "nonEuManufacturer">[];
export function useProductLegalText() {
  const { locale } = useLocale();
  const n =
    ({ en: 0, de: 1, fr: 2, es: 3 } as Record<string, number>)[
      locale.split("-")[0]
    ] ?? 0;
  return { p: (k: keyof typeof productLegalWords) => productLegalWords[k][n] };
}
