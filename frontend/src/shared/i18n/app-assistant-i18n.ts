/** App assistants and extension permissions use the same EN/DE/FR/ES vocabulary. */
import { useLocale } from "./i18n";
export const assistantWords = {
  appId: [
    "Technical app ID",
    "Technische App-ID",
    "Identifiant technique de l’app",
    "ID técnico de la app",
  ],
  findObject: [
    "Find a test object",
    "Testobjekt suchen",
    "Chercher un objet de test",
    "Buscar un objeto de prueba",
  ],
  chooseObject: [
    "Choose an object",
    "Objekt auswählen",
    "Choisir un objet",
    "Elegir un objeto",
  ],
  start: [
    "What are you building?",
    "Welche App möchtest du bauen?",
    "Quelle app construisez-vous ?",
    "¿Qué app quieres crear?",
  ],
  hint: [
    "Choose a starting point. Define placement, data and access together.",
    "Wähle einen Einstieg. Lege Einbauort, Daten und Zugriffe gemeinsam fest.",
    "Choisissez un point de départ, les données et les accès.",
    "Elige un punto de partida, datos y accesos.",
  ],
  frontend: ["Storefront app", "Frontend-App", "App boutique", "App de tienda"],
  admin: [
    "Admin app",
    "Admin-App",
    "App administration",
    "App de administración",
  ],
  combined: [
    "Connected experience",
    "Kombinierte App",
    "Expérience connectée",
    "Experiencia conectada",
  ],
  payment: [
    "Payment connector",
    "Zahlungsanbindung",
    "Connecteur de paiement",
    "Conector de pagos",
  ],
  shipping: [
    "Shipping connector",
    "Versandanbindung",
    "Connecteur de livraison",
    "Conector de envíos",
  ],
  integration: [
    "ERP & external systems",
    "ERP & Drittsysteme",
    "ERP et systèmes externes",
    "ERP y sistemas externos",
  ],
  event: [
    "Events & flow actions",
    "Events & Flow-Aktionen",
    "Événements et actions",
    "Eventos y acciones de flujo",
  ],
  webhook: [
    "Incoming webhook",
    "Eingehender Webhook",
    "Webhook entrant",
    "Webhook entrante",
  ],
  scheduled: [
    "Scheduled automation",
    "Zeitgesteuerte Automation",
    "Automatisation planifiée",
    "Automatización programada",
  ],
  frontendHint: [
    "Read-only product or shop content, backed by managed data.",
    "Produkt- oder Shop-Inhalte mit verwalteten Daten.",
    "Contenu produit ou boutique avec données gérées.",
    "Contenido de producto o tienda con datos gestionados.",
  ],
  adminHint: [
    "Add fields to an existing editor or create a new module.",
    "Erweitere einen vorhandenen Editor oder baue ein neues Modul.",
    "Étendez un éditeur ou créez un module.",
    "Amplía un editor o crea un módulo.",
  ],
  combinedHint: [
    "Manage privately, publish selected product content to shoppers.",
    "Privat pflegen, ausgewählte Produktinhalte für Kunden veröffentlichen.",
    "Gérez en privé et publiez le contenu produit choisi.",
    "Gestiona en privado y publica contenido seleccionado.",
  ],
  paymentHint: [
    "Provider service contract for initiation, capture and refunds.",
    "Dienstvertrag für Zahlungsstart, Einzug und Erstattung.",
    "Contrat de service pour paiement, capture et remboursement.",
    "Contrato de servicio para inicio, captura y reembolso.",
  ],
  shippingHint: [
    "Labels and tracking as order tools and flow actions.",
    "Labels und Tracking als Bestellwerkzeuge und Flow-Aktionen.",
    "Étiquettes et suivi comme outils de commande et de flux.",
    "Etiquetas y seguimiento como herramientas y acciones.",
  ],
  integrationHint: [
    "Order events, custom data and a synchronization action.",
    "Bestellereignisse, eigene Daten und eine Synchronisationsaktion.",
    "Événements de commande, données et synchronisation.",
    "Eventos de pedido, datos y sincronización.",
  ],
  eventHint: [
    "A private action that flows can invoke and services can consume.",
    "Eine private Aktion für Flows und angebundene Dienste.",
    "Une action privée pour les flux et les services.",
    "Una acción privada para flujos y servicios.",
  ],
  webhookHint: [
    "Signed, replay-safe events from an external service.",
    "Signierte Ereignisse eines Drittsystems mit Wiederholungsschutz.",
    "Événements signés avec protection contre les répétitions.",
    "Eventos firmados con protección contra repeticiones.",
  ],
  scheduledHint: [
    "Emit recurring events, then connect rules and flow actions.",
    "Erzeuge wiederkehrende Ereignisse und verbinde Regeln und Flows.",
    "Émettez des événements récurrents pour les flux.",
    "Emite eventos recurrentes para reglas y flujos.",
  ],
  setup: [
    "Shape your app",
    "Deine App gestalten",
    "Configurez votre app",
    "Configura tu app",
  ],
  placement: [
    "Where should it appear?",
    "Wo soll sie erscheinen?",
    "Où doit-elle apparaître ?",
    "¿Dónde debe aparecer?",
  ],
  navigation: [
    "Own admin module",
    "Eigenes Admin-Modul",
    "Module d’administration",
    "Módulo propio",
  ],
  productGeneral: [
    "Product · general section",
    "Produkt · Bereich in Stammdaten",
    "Produit · section générale",
    "Producto · sección general",
  ],
  productTab: [
    "Product · new submenu",
    "Produkt · neuer Untermenüpunkt",
    "Produit · nouvel onglet",
    "Producto · nuevo submenú",
  ],
  customerFields: [
    "Customer · additional fields",
    "Kunde · zusätzliche Felder",
    "Client · champs supplémentaires",
    "Cliente · campos adicionales",
  ],
  orderFields: [
    "Order · additional section",
    "Bestellung · zusätzlicher Bereich",
    "Commande · section supplémentaire",
    "Pedido · sección adicional",
  ],
  productDetail: [
    "Product detail",
    "Produktdetailseite",
    "Fiche produit",
    "Detalle de producto",
  ],
  storefrontPage: [
    "Own storefront page",
    "Eigene Frontend-Seite",
    "Page boutique",
    "Página de tienda",
  ],
  access: [
    "Access & exposure",
    "Zugriff & Freigaben",
    "Accès et exposition",
    "Acceso y exposición",
  ],
  permission: [
    "Required team permission",
    "Erforderliches Teamrecht",
    "Permission requise",
    "Permiso de equipo requerido",
  ],
  legacyPermission: [
    "Platform default",
    "Plattform-Standard",
    "Valeur par défaut",
    "Valor predeterminado",
  ],
  privateData: [
    "Private app data",
    "Private App-Daten",
    "Données privées",
    "Datos privados",
  ],
  storefrontAccess: [
    "Readable through the Storefront API",
    "Über die Frontend-API lesbar",
    "Lecture via l’API boutique",
    "Lectura mediante API de tienda",
  ],
  mcpAccess: [
    "Expose action to MCP / agents",
    "Aktion für MCP / Agenten freigeben",
    "Exposer à MCP / agents",
    "Exponer a MCP / agentes",
  ],
  mcpHint: [
    "Disabling MCP also blocks direct tool calls. HTTP and editor access remain governed by team rights.",
    "Ohne MCP-Freigabe werden auch direkte Tool-Aufrufe blockiert. HTTP und Editoren nutzen weiterhin Teamrechte.",
    "Sans MCP, les appels directs sont bloqués. HTTP suit les droits d’équipe.",
    "Sin MCP se bloquean llamadas directas. HTTP respeta los permisos del equipo.",
  ],
  create: [
    "Create editable draft",
    "Bearbeitbaren Entwurf anlegen",
    "Créer un brouillon",
    "Crear borrador editable",
  ],
  back: [
    "Choose another type",
    "Anderen Typ auswählen",
    "Choisir un autre type",
    "Elegir otro tipo",
  ],
  cancel: [
    "Close assistant",
    "Assistent schließen",
    "Fermer l’assistant",
    "Cerrar asistente",
  ],
  title: ["Title", "Titel", "Titre", "Título"],
  body: ["Content", "Inhalt", "Contenu", "Contenido"],
  choice: ["Selection", "Auswahlliste", "Liste de choix", "Lista de selección"],
  standard: ["Standard", "Standard", "Standard", "Estándar"],
  priority: ["Priority", "Priorität", "Priorité", "Prioridad"],
  object: [
    "Core object",
    "Commerce-Objekt",
    "Objet commerce",
    "Objeto de comercio",
  ],
  binding: [
    "Bind to open editor",
    "An geöffneten Editor binden",
    "Lier à l’éditeur ouvert",
    "Vincular al editor abierto",
  ],
  none: ["No binding", "Ohne Bindung", "Sans liaison", "Sin vinculación"],
  choices: [
    "Choice values",
    "Auswahlwerte",
    "Valeurs de choix",
    "Valores de selección",
  ],
  addChoice: [
    "Add choice",
    "Auswahlwert hinzufügen",
    "Ajouter un choix",
    "Añadir opción",
  ],
  serviceNotice: [
    "The managed editor works immediately. External provider operations need an operator-configured service. This draft is a connector contract, not an implemented payment or shipping provider.",
    "Der Dateneditor funktioniert sofort. Anbieteraktionen brauchen einen konfigurierten Dienst. Dieser Entwurf ist ein Anschlussvertrag; ein Zahlungs- oder Versandprovider ist damit noch nicht implementiert.",
    "L’éditeur fonctionne immédiatement. Les opérations externes nécessitent un service configuré ; le fournisseur n’est pas encore implémenté.",
    "El editor funciona de inmediato. Las operaciones externas requieren un servicio configurado; el proveedor aún no está implementado.",
  ],
  serviceAction: [
    "External operation",
    "Externe Aktion",
    "Opération externe",
    "Operación externa",
  ],
  eventName: [
    "Event to subscribe to",
    "Abonniertes Ereignis",
    "Événement abonné",
    "Evento suscrito",
  ],
  cron: [
    "Schedule in UTC (six cron fields)",
    "Zeitplan in UTC (sechs Cron-Felder)",
    "Plan UTC (six champs cron)",
    "Horario UTC (seis campos cron)",
  ],
  automation: [
    "Automation contract",
    "Automationsvertrag",
    "Contrat d’automatisation",
    "Contrato de automatización",
  ],
  trigger: ["Trigger", "Auslöser", "Déclencheur", "Disparador"],
  webhookNotice: [
    "Configure a per-shop signing key on the server before accepting external webhooks. No secrets are stored in the app definition.",
    "Hinterlege vor eingehenden Webhooks einen Signaturschlüssel je Shop auf dem Server. Die App-Definition enthält keine Geheimnisse.",
    "Configurez une clé par boutique sur le serveur ; aucun secret dans la définition.",
    "Configura una clave por tienda en el servidor; no hay secretos en la definición.",
  ],
  draftWarning: [
    "Replace current draft?",
    "Aktuellen Entwurf ersetzen?",
    "Remplacer le brouillon ?",
    "¿Reemplazar el borrador?",
  ],
  draftWarningHint: [
    "Unsaved changes in this draft will be replaced. Saved versions remain in your library.",
    "Ungespeicherte Änderungen werden ersetzt. Gespeicherte Versionen bleiben in der Bibliothek.",
    "Les changements non enregistrés seront remplacés. Les versions enregistrées restent.",
    "Los cambios sin guardar se reemplazan. Las versiones guardadas permanecen.",
  ],
} as const;
export type AssistantKey = keyof typeof assistantWords;
export function assistantText(key: AssistantKey) {
  const v = assistantWords[key];
  return { en: v[0], de: v[1], fr: v[2], es: v[3] };
}
export function useAssistantText() {
  const context = useLocale();
  const i = context.locale.startsWith("de")
    ? 1
    : context.locale.startsWith("fr")
      ? 2
      : context.locale.startsWith("es")
        ? 3
        : 0;
  return { ...context, t: (key: AssistantKey) => assistantWords[key][i] };
}
