/** Shared lifecycle, starting-process and dependency vocabulary for every automation editor. */
import { useLocale } from "../../shared/i18n/i18n";
const words = {
  version: ["Revision", "Revision", "Révision", "Revisión"],
  search: [
    "Search definitions",
    "Konfigurationen suchen",
    "Rechercher",
    "Buscar configuraciones",
  ],
  edit: ["Edit", "Bearbeiten", "Modifier", "Editar"],
  create: ["Create new", "Neu anlegen", "Créer", "Crear nueva"],
  delete: ["Delete", "Löschen", "Supprimer", "Eliminar"],
  confirm: [
    "Delete this configuration?",
    "Diese Konfiguration löschen?",
    "Supprimer cette configuration ?",
    "¿Eliminar esta configuración?",
  ],
  explanation: [
    "The current revision will be removed. Existing order records and completed flow results remain in the audit history.",
    "Die aktuelle Konfiguration wird entfernt. Bestellungen und abgeschlossene Flow-Ergebnisse bleiben in der Historie erhalten.",
    "La configuration sera supprimée. Les commandes et résultats terminés restent dans l’historique.",
    "Se eliminará la configuración. Los pedidos y resultados completados permanecen en el historial.",
  ],
  blocked: [
    "Still in use. Remove these references first, or deactivate the configuration.",
    "Noch in Verwendung. Löse zuerst diese Verknüpfungen oder deaktiviere die Konfiguration.",
    "Encore utilisée. Retirez les références ou désactivez la configuration.",
    "Sigue en uso. Elimina las referencias o desactiva la configuración.",
  ],
  checking: [
    "Checking dependencies…",
    "Verwendungen werden geprüft…",
    "Vérification…",
    "Comprobando dependencias…",
  ],
  empty: [
    "No definitions yet. Create one to get started.",
    "Noch keine Konfiguration. Lege eine neue an.",
    "Aucune configuration. Créez-en une.",
    "Sin configuraciones. Crea una para empezar.",
  ],
  active: ["Active", "Aktiv", "Active", "Activa"],
  inactive: ["Inactive", "Inaktiv", "Inactive", "Inactiva"],
  saved: [
    "Changes saved",
    "Änderungen gespeichert",
    "Modifications enregistrées",
    "Cambios guardados",
  ],
  processes: [
    "Your shop processes",
    "Deine Shop-Prozesse",
    "Vos processus",
    "Procesos de tu tienda",
  ],
  processHint: [
    "Starter flows record incoming orders and confirmed payments in order history. Open a definition to change its conditions and actions. Email, Slack and AI steps can be added after connecting the corresponding app.",
    "Start-Flows erfassen eingegangene Bestellungen und bestätigte Zahlungen in der Bestellhistorie. Öffne einen Prozess, um Bedingungen und Aktionen zu bearbeiten. E-Mail-, Slack- und KI-Schritte kannst du nach Anbindung der jeweiligen App ergänzen.",
    "Les flux initiaux enregistrent commandes et paiements confirmés dans l’historique. Modifiez conditions et actions. Ajoutez email, Slack et IA après connexion de l’application.",
    "Los flujos iniciales registran pedidos y pagos confirmados en el historial. Edita condiciones y acciones. Añade email, Slack e IA tras conectar la app.",
  ],
  coreHint: [
    "Pricing, tax calculation, stock and valid order transitions remain enforced by the commerce kernel. Flows orchestrate merchant processes around those guarantees. Discounts are never enabled automatically.",
    "Preise, Steuerberechnung, Bestand und gültige Bestellübergänge werden vom Commerce-Kern abgesichert. Flows steuern deine Abläufe darauf aufbauend. Rabatte werden nie automatisch aktiviert.",
    "Le noyau garantit prix, taxes, stock et transitions. Les flux orchestrent vos processus. Aucune remise automatique.",
    "El núcleo garantiza precios, impuestos, stock y transiciones. Los flujos coordinan tus procesos. No se activan descuentos automáticamente.",
  ],
  frontends: [
    "Connected domains & experiences",
    "Verbundene Domains & Experiences",
    "Domaines et expériences connectés",
    "Dominios y experiencias conectados",
  ],
  default_channel: [
    "The main channel is required",
    "Der Hauptkanal wird benötigt",
    "Le canal principal est requis",
    "El canal principal es obligatorio",
  ],
  rules: ["Rules", "Regeln", "Règles", "Reglas"],
  flows: ["Flows", "Flows", "Flux", "Flujos"],
  promotions: ["Promotions", "Aktionen", "Promotions", "Promociones"],
  orders: ["Orders", "Bestellungen", "Commandes", "Pedidos"],
  pending_jobs: [
    "Pending flow executions",
    "Offene Flow-Ausführungen",
    "Exécutions en attente",
    "Ejecuciones pendientes",
  ],
  carts: ["Carts", "Warenkörbe", "Paniers", "Carritos"],
  customers: ["Customers", "Kunden", "Clients", "Clientes"],
  product_visibility: [
    "Product assignments",
    "Produktzuordnungen",
    "Produits affectés",
    "Productos asignados",
  ],
  company_settings: [
    "Company overrides",
    "Abweichende Stammdaten",
    "Identité spécifique",
    "Datos de empresa propios",
  ],
  channel_settings: [
    "Channel overrides",
    "Kanaleinstellungen",
    "Réglages du canal",
    "Ajustes del canal",
  ],
  settings: [
    "Shop settings",
    "Shop-Einstellungen",
    "Réglages boutique",
    "Ajustes de tienda",
  ],
  start: [
    "Starts at (local time)",
    "Beginn (Ortszeit)",
    "Début (heure locale)",
    "Inicio (hora local)",
  ],
  end: [
    "Ends at (local time)",
    "Ende (Ortszeit)",
    "Fin (heure locale)",
    "Fin (hora local)",
  ],
  priority: ["Priority", "Priorität", "Priorité", "Prioridad"],
  exclusive: [
    "Do not combine with other promotions",
    "Nicht mit anderen Aktionen kombinieren",
    "Ne pas combiner les promotions",
    "No combinar promociones",
  ],
  inheritLanguages: [
    "The main channel inherits all enabled shop languages and shared company/checkout settings.",
    "Der Hauptkanal erbt alle aktivierten Shop-Sprachen sowie die gemeinsamen Stamm- und Checkout-Einstellungen.",
    "Le canal principal hérite des langues et réglages communs.",
    "El canal principal hereda los idiomas y ajustes compartidos.",
  ],
} as const;
export function useLifecycleText() {
  const { locale } = useLocale();
  const i = locale.startsWith("de")
    ? 1
    : locale.startsWith("fr")
      ? 2
      : locale.startsWith("es")
        ? 3
        : 0;
  return (key: keyof typeof words) => words[key][i];
}
export type DependencyKind =
  | "frontends"
  | "default_channel"
  | "rules"
  | "flows"
  | "promotions"
  | "orders"
  | "pending_jobs"
  | "carts"
  | "customers"
  | "product_visibility"
  | "company_settings"
  | "channel_settings"
  | "settings";
