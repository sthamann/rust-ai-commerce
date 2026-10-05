/** App library vocabulary and built-in summaries; no inferred connection or payment readiness. */
import { useLocale } from "./i18n";
export const libraryWords = {
  heading: [
    "Make your shop do more",
    "Mehr Möglichkeiten für deinen Shop",
    "Plus de possibilités pour votre boutique",
    "Más posibilidades para tu tienda",
  ],
  intro: [
    "Find the right tools. Connect services, shape experiences and manage every app in one place.",
    "Finde die passenden Werkzeuge. Verbinde Dienste, gestalte Erlebnisse und verwalte jede App an einem Ort.",
    "Trouvez les bons outils. Connectez des services et gérez chaque app au même endroit.",
    "Encuentra las herramientas adecuadas. Conecta servicios y gestiona cada app en un solo lugar.",
  ],
  installed: ["Installed", "Installiert", "Installées", "Instaladas"],
  discover: ["Discover", "Entdecken", "Découvrir", "Descubrir"],
  search: ["Search apps", "Apps suchen", "Rechercher des apps", "Buscar apps"],
  enabled: ["Enabled", "Aktiviert", "Activées", "Activadas"],
  disabled: ["Disabled", "Deaktiviert", "Désactivées", "Desactivadas"],
  allStatuses: [
    "All statuses",
    "Alle Status",
    "Tous les statuts",
    "Todos los estados",
  ],
  available: [
    "Available to install",
    "Zum Installieren verfügbar",
    "Disponible à installer",
    "Disponible para instalar",
  ],
  empty: [
    "No matching apps",
    "Keine passenden Apps",
    "Aucune app correspondante",
    "No hay apps coincidentes",
  ],
  reset: [
    "Reset filters",
    "Filter zurücksetzen",
    "Réinitialiser les filtres",
    "Restablecer filtros",
  ],
  loading: [
    "Loading your apps…",
    "Deine Apps werden geladen…",
    "Chargement de vos apps…",
    "Cargando tus apps…",
  ],
  retry: ["Try again", "Erneut versuchen", "Réessayer", "Reintentar"],
  permissions: [
    "App permissions",
    "App-Berechtigungen",
    "Autorisations de l’app",
    "Permisos de la app",
  ],
  disabledHint: [
    "Enable this app to use its interface and data. Existing data is retained.",
    "Aktiviere diese App, um Oberfläche und Daten zu nutzen. Vorhandene Daten bleiben erhalten.",
    "Activez cette app pour utiliser son interface. Les données sont conservées.",
    "Activa esta app para usar su interfaz. Los datos se conservan.",
  ],
  noInterface: [
    "This app has no standalone admin page. Use its settings or data tabs.",
    "Diese App hat keine eigene Admin-Seite. Nutze ihre Einstellungen oder den Datenbereich.",
    "Cette app n’a pas de page admin dédiée. Utilisez ses paramètres ou ses données.",
    "Esta app no tiene página de administración propia. Usa sus ajustes o datos.",
  ],
  noData: [
    "This app does not define editable data collections.",
    "Diese App definiert keine bearbeitbaren Datensammlungen.",
    "Cette app ne définit pas de collections modifiables.",
    "Esta app no define colecciones editables.",
  ],
  generic: [
    "Extend your shop with dedicated features, data and actions.",
    "Erweitere deinen Shop um eigene Funktionen, Daten und Aktionen.",
    "Étendez votre boutique avec des fonctions, données et actions dédiées.",
    "Amplía tu tienda con funciones, datos y acciones propias.",
  ],
  engraving: [
    "Personal messages on products, with server-calculated surcharges.",
    "Persönliche Botschaften auf Produkten mit serverseitig berechneten Aufpreisen.",
    "Messages personnalisés sur les produits avec suppléments calculés côté serveur.",
    "Mensajes personalizados en productos con recargos calculados en el servidor.",
  ],
  paypal: [
    "Connect PayPal. Account configuration and environment determine checkout availability.",
    "Verbinde PayPal. Kontoeinrichtung und Umgebung bestimmen die Verfügbarkeit im Checkout.",
    "Connectez PayPal. Le compte et l’environnement déterminent la disponibilité au paiement.",
    "Conecta PayPal. La cuenta y el entorno determinan su disponibilidad en el checkout.",
  ],
  shopware_payments: [
    "Integration contract for Shopware Payments. The official connector is still required.",
    "Integrationsvertrag für Shopware Payments. Der offizielle Anschluss wird weiterhin benötigt.",
    "Contrat d’intégration Shopware Payments. Le connecteur officiel reste nécessaire.",
    "Contrato de integración Shopware Payments. Aún se necesita el conector oficial.",
  ],
  storyfront: [
    "Connect your catalogue and checkout to conversational shopping experiences.",
    "Verbinde Katalog und Checkout mit dialogbasierten Shopping-Erlebnissen.",
    "Connectez votre catalogue et paiement à des expériences d’achat conversationnelles.",
    "Conecta catálogo y checkout con experiencias de compra conversacionales.",
  ],
  google_analytics: [
    "Consent-based storefront tracking and analytics for shop intelligence.",
    "Consent-basiertes Tracking im Shop und Analysedaten für die Shop-Intelligenz.",
    "Suivi avec consentement et données analytiques pour l’intelligence de la boutique.",
    "Seguimiento con consentimiento y analítica para la inteligencia de la tienda.",
  ],
  gmail: [
    "Bring support conversations into your shop’s knowledge with a configured Gmail connection.",
    "Integriere Support-Gespräche über einen eingerichteten Gmail-Anschluss in dein Shopwissen.",
    "Intégrez les conversations de support aux connaissances via une connexion Gmail configurée.",
    "Integra conversaciones de soporte mediante una conexión Gmail configurada.",
  ],
  slack: [
    "Send flow notifications to a configured Slack destination.",
    "Sende Flow-Benachrichtigungen an ein eingerichtetes Slack-Ziel.",
    "Envoyez des notifications de flux vers une destination Slack configurée.",
    "Envía notificaciones de flujos a un destino Slack configurado.",
  ],
  email: [
    "Transactional email through SMTP, Resend or SendGrid, with delivery history.",
    "Transaktions-E-Mails über SMTP, Resend oder SendGrid mit Versandhistorie.",
    "E-mails transactionnels via SMTP, Resend ou SendGrid avec historique.",
    "Correos transaccionales mediante SMTP, Resend o SendGrid con historial.",
  ],
  care: [
    "Maintain product care guides and display them in your storefront.",
    "Pflege Produkthinweise und zeige sie direkt im Storefront an.",
    "Gérez les conseils d’entretien et affichez-les dans votre boutique.",
    "Gestiona guías de cuidado y muéstralas en tu tienda.",
  ],
  entities: [
    "Data collections",
    "Datensammlungen",
    "Collections",
    "Colecciones",
  ],
  actions: [
    "API & agent actions",
    "API- & Agent-Aktionen",
    "Actions API et agents",
    "Acciones API y agentes",
  ],
  surfaces: ["Interfaces", "Oberflächen", "Interfaces", "Interfaces"],
  events: [
    "Event subscriptions",
    "Event-Abonnements",
    "Abonnements aux événements",
    "Suscripciones a eventos",
  ],
  noEvents: [
    "No event subscriptions",
    "Keine Event-Abonnements",
    "Aucun abonnement aux événements",
    "Sin suscripciones a eventos",
  ],
  revision: ["Revision", "Revision", "Révision", "Revisión"],
  runtime: ["Runtime", "Laufzeit", "Exécution", "Ejecución"],
  configure: ["Manage app", "App verwalten", "Gérer l’app", "Gestionar app"],
  pauseTitle: [
    "Disable this app?",
    "Diese App deaktivieren?",
    "Désactiver cette app ?",
    "¿Desactivar esta app?",
  ],
  pauseHint: [
    "Its interfaces and actions become unavailable. Data is retained; reactivation is possible.",
    "Ihre Oberflächen und Aktionen sind danach nicht verfügbar. Daten bleiben erhalten; du kannst sie wieder aktivieren.",
    "Ses interfaces et actions deviennent indisponibles. Les données sont conservées.",
    "Sus interfaces y acciones dejan de estar disponibles. Los datos se conservan.",
  ],
} as const;
export type LibraryKey = keyof typeof libraryWords;
export function useLibraryText() {
  const { locale } = useLocale();
  const index = locale.startsWith("de")
    ? 1
    : locale.startsWith("fr")
      ? 2
      : locale.startsWith("es")
        ? 3
        : 0;
  return (key: LibraryKey) => libraryWords[key][index];
}
