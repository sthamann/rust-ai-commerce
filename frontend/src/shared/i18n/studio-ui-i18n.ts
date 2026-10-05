/** Studio navigation and settings guidance in all four supported interface languages. */
import { useLocale } from "./i18n";
const words = {
  intelligence: ["Intelligence", "Intelligenz", "Intelligence", "Inteligencia"],
  commerce: ["Commerce", "Commerce", "Commerce", "Comercio"],
  experiences: ["Experiences", "Erlebnisse", "Expériences", "Experiencias"],
  workspace: [
    "Workspace",
    "Arbeitsbereich",
    "Espace de travail",
    "Espacio de trabajo",
  ],
  shopSettings: [
    "Shop settings",
    "Shop-Einstellungen",
    "Paramètres de la boutique",
    "Configuración de la tienda",
  ],
  settingsHint: [
    "The foundations of your shop. Clear, connected and in one place.",
    "Die Grundlagen deines Shops. Übersichtlich, verbunden und an einem Ort.",
    "Les bases de votre boutique. Claires, connectées et réunies.",
    "Las bases de tu tienda. Claras, conectadas y en un solo lugar.",
  ],
  companyHint: [
    "Legal identity and document issuer",
    "Firmenidentität & Belegaussteller",
    "Identité légale et émetteur",
    "Identidad legal y emisor",
  ],
  taxesHint: [
    "Rates by country",
    "Steuersätze je Land",
    "Taux par pays",
    "Tipos por país",
  ],
  countriesHint: [
    "Where your shop sells",
    "In welchen Ländern du verkaufst",
    "Les pays de vente",
    "Países donde vendes",
  ],
  shippingHint: [
    "Fees, availability and delivery times",
    "Kosten, Verfügbarkeit & Lieferzeiten",
    "Tarifs, disponibilité et délais",
    "Costes, disponibilidad y plazos",
  ],
  paymentHint: [
    "Payment methods and eligibility",
    "Zahlungsarten & Verfügbarkeit",
    "Moyens de paiement et conditions",
    "Métodos de pago y condiciones",
  ],
  automationHint: [
    "Rules, flows and sales channels",
    "Regeln, Flows & Verkaufskanäle",
    "Règles, flux et canaux de vente",
    "Reglas, flujos y canales",
  ],
  teamHint: [
    "Members and permissions",
    "Mitglieder & Berechtigungen",
    "Membres et permissions",
    "Miembros y permisos",
  ],
  aiHint: [
    "Models and provider connections",
    "Modelle & Anbieter verbinden",
    "Modèles et fournisseurs",
    "Modelos y proveedores",
  ],
  connectedAreas: [
    "Connected workspaces",
    "Verbundene Bereiche",
    "Espaces connectés",
    "Espacios conectados",
  ],
  identity: [
    "Company identity",
    "Firmenidentität",
    "Identité de l’entreprise",
    "Identidad de la empresa",
  ],
  identityHint: [
    "Used on invoices and other shop documents.",
    "Diese Angaben erscheinen auf Rechnungen und anderen Belegen.",
    "Ces informations figurent sur les factures et documents.",
    "Estos datos aparecen en facturas y documentos.",
  ],
  contact: [
    "Contact details",
    "Kontaktdaten",
    "Coordonnées",
    "Datos de contacto",
  ],
  bank: [
    "Bank details",
    "Bankverbindung",
    "Coordonnées bancaires",
    "Datos bancarios",
  ],
  bankHint: [
    "Document information; this does not configure a payment provider.",
    "Angaben für Belege; Zahlungsanbieter werden separat eingerichtet.",
    "Informations pour les documents ; les prestataires se configurent séparément.",
    "Datos para documentos; los proveedores de pago se configuran por separado.",
  ],
  upToDate: [
    "All changes saved",
    "Alle Änderungen gespeichert",
    "Tout est enregistré",
    "Todos los cambios guardados",
  ],
  unsaved: [
    "Unsaved changes",
    "Ungespeicherte Änderungen",
    "Modifications non enregistrées",
    "Cambios sin guardar",
  ],
  saving: ["Saving…", "Wird gespeichert …", "Enregistrement…", "Guardando…"],
  saved: [
    "Changes saved",
    "Änderungen gespeichert",
    "Modifications enregistrées",
    "Cambios guardados",
  ],
  saveChanges: [
    "Save changes",
    "Änderungen speichern",
    "Enregistrer",
    "Guardar cambios",
  ],
  readOnly: [
    "Read-only access",
    "Nur Lesezugriff",
    "Accès en lecture seule",
    "Acceso de solo lectura",
  ],
  discardHint: [
    "This page has unsaved changes. Save them first or explicitly discard them.",
    "Diese Seite enthält ungespeicherte Änderungen. Speichere sie zuerst oder verwirf sie ausdrücklich.",
    "Cette page contient des modifications. Enregistrez-les ou abandonnez-les.",
    "Esta página tiene cambios sin guardar. Guárdalos o descártalos.",
  ],
  keepEditing: [
    "Keep editing",
    "Weiter bearbeiten",
    "Continuer",
    "Seguir editando",
  ],
  discard: [
    "Discard and continue",
    "Verwerfen & wechseln",
    "Abandonner et continuer",
    "Descartar y continuar",
  ],
} as const;
export function useStudioText() {
  const { locale } = useLocale();
  const index = { "en-GB": 0, "de-DE": 1, "fr-FR": 2, "es-ES": 3 }[locale];
  return { u: (key: keyof typeof words) => words[key][index] };
}
