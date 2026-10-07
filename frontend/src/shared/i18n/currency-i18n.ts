/** Complete currency settings vocabulary, shared by storefront and channel editors. */
import { useLocale } from "./i18n";
export const currencyWords = {
  refundAmount: [
    "Refund amount",
    "Erstattungsbetrag",
    "Montant du remboursement",
    "Importe del reembolso",
  ],
  priceCurrency: [
    "Product source price currency",
    "Währung des Produkt-Ausgangspreises",
    "Devise du prix source produit",
    "Moneda del precio original del producto",
  ],
  sourceCurrency: [
    "Shipping and absolute discounts: source currency",
    "Versand und absolute Rabatte: Ausgangswährung",
    "Livraison et remises absolues : devise source",
    "Envío y descuentos absolutos: moneda original",
  ],
  title: ["Currencies", "Währungen", "Devises", "Monedas"],
  hint: [
    "Prices, exchange rates and currencies per sales channel.",
    "Preise, Wechselkurse und Währungen je Verkaufskanal.",
    "Prix, taux et devises par canal.",
    "Precios, tipos de cambio y monedas por canal.",
  ],
  base: [
    "Shop base currency",
    "Basiswährung des Shops",
    "Devise de base",
    "Moneda base",
  ],
  default: [
    "Default currency",
    "Standardwährung",
    "Devise par défaut",
    "Moneda predeterminada",
  ],
  available: [
    "Currencies offered",
    "Angebotene Währungen",
    "Devises proposées",
    "Monedas disponibles",
  ],
  add: [
    "Add currency",
    "Währung hinzufügen",
    "Ajouter une devise",
    "Añadir moneda",
  ],
  remove: ["Remove", "Entfernen", "Supprimer", "Eliminar"],
  rate: [
    "Exchange rate · units per base currency",
    "Wechselkurs · Einheiten je Basiswährung",
    "Taux · unités par devise de base",
    "Tipo de cambio · unidades por moneda base",
  ],
  strategy: [
    "Product pricing",
    "Produktpreisstrategie",
    "Tarification",
    "Precios de productos",
  ],
  automatic: [
    "Convert with latest stored rate",
    "Mit aktuellem gespeichertem Kurs umrechnen",
    "Convertir au dernier taux enregistré",
    "Convertir al último tipo guardado",
  ],
  fixed: [
    "Fixed prices · convert when missing",
    "Festpreise · fehlende Preise umrechnen",
    "Prix fixes · convertir les prix absents",
    "Precios fijos · convertir los que falten",
  ],
  refresh: [
    "Fetch ECB rates",
    "EZB-Kurse abrufen",
    "Actualiser les taux BCE",
    "Actualizar tipos del BCE",
  ],
  refreshHint: [
    "Save changes first. Reference rates update daily on working days; unsupported currencies require manual rates. Checkout never calls a rate provider.",
    "Änderungen zuerst speichern. Referenzkurse werden werktäglich aktualisiert; nicht unterstützte Währungen benötigen manuelle Kurse. Der Checkout ruft keinen Kursanbieter auf.",
    "Enregistrez d’abord. Taux de référence quotidiens les jours ouvrables. Les autres devises nécessitent des taux manuels.",
    "Guarda primero. Tipos de referencia diarios en días laborables; las demás monedas requieren tipos manuales.",
  ],
  autoRefresh: [
    "Refresh ECB rates automatically",
    "EZB-Kurse automatisch aktualisieren",
    "Actualiser automatiquement les taux BCE",
    "Actualizar automáticamente tipos del BCE",
  ],
  source: [
    "Rate source / date",
    "Kursquelle / Stand",
    "Source / date",
    "Origen / fecha",
  ],
  manual: ["Manual", "Manuell", "Manuel", "Manual"],
  generate: [
    "Generate missing fixed prices",
    "Fehlende Festpreise erzeugen",
    "Créer les prix fixes manquants",
    "Generar precios fijos que falten",
  ],
  overwrite: [
    "Replace existing fixed prices",
    "Vorhandene Festpreise ersetzen",
    "Remplacer les prix fixes existants",
    "Reemplazar precios fijos existentes",
  ],
  generateHint: [
    "Uses the saved rate, works in batches and preserves existing prices by default. Save configuration before starting.",
    "Verwendet den gespeicherten Kurs, arbeitet in Paketen und erhält standardmäßig vorhandene Preise. Konfiguration vor dem Start speichern.",
    "Utilise le taux enregistré par lots et conserve les prix existants. Enregistrez avant de commencer.",
    "Utiliza el tipo guardado por lotes y conserva los precios existentes. Guarda antes de empezar.",
  ],
  jobs: [
    "Price generation jobs",
    "Aufträge zur Preisgenerierung",
    "Génération des prix",
    "Trabajos de generación de precios",
  ],
  queued: ["Queued", "In Warteschlange", "En attente", "En cola"],
  completed: ["Completed", "Abgeschlossen", "Terminé", "Completado"],
  failed: ["Failed", "Fehlgeschlagen", "Échec", "Error"],
  processed: [
    "Products processed",
    "Verarbeitete Produkte",
    "Produits traités",
    "Productos procesados",
  ],
  prices: [
    "Fixed currency prices",
    "Währungsspezifische Festpreise",
    "Prix fixes par devise",
    "Precios fijos por moneda",
  ],
  price: ["Gross price", "Bruttopreis", "Prix TTC", "Precio bruto"],
  list: ["List price", "Streichpreis", "Prix catalogue", "Precio de lista"],
  regulation: [
    "Previous price",
    "Vorheriger Preis",
    "Prix précédent",
    "Precio anterior",
  ],
  inherited: [
    "No fixed price · uses conversion",
    "Kein Festpreis · verwendet Umrechnung",
    "Sans prix fixe · conversion",
    "Sin precio fijo · conversión",
  ],
  select: ["Currency", "Währung", "Devise", "Moneda"],
  loading: ["Loading…", "Wird geladen …", "Chargement…", "Cargando…"],
  saveFirst: [
    "Save changes before running this action.",
    "Änderungen vor dieser Aktion speichern.",
    "Enregistrez avant cette action.",
    "Guarda los cambios antes de esta acción.",
  ],
  baseHint: [
    "Changing the FX base preserves the currency of existing product prices. Legacy shipping amounts and absolute promotions keep their original pricing currency.",
    "Ein Wechsel der Kursbasis erhält die Währung bestehender Produktpreise. Alte Versandbeträge und absolute Rabatte behalten ihre ursprüngliche Preiswährung.",
    "Changer la base des taux conserve la devise des prix existants. Les anciens frais de livraison et remises gardent leur devise.",
    "Cambiar la base de tipos conserva la moneda de los precios existentes. Gastos de envío y descuentos anteriores mantienen su moneda.",
  ],
} as const satisfies Record<string, readonly [string, string, string, string]>;
export function useCurrencyText() {
  const { locale } = useLocale();
  const index = { "en-GB": 0, "de-DE": 1, "fr-FR": 2, "es-ES": 3 }[locale];
  return {
    c: (k: keyof typeof currencyWords) => currencyWords[k][index],
    locale,
  };
}
