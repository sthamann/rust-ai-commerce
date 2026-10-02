/** App and evidence UI vocabulary, shared by store, merchant and payment components. */
import { useLocale } from "./i18n";
const words = {
  rules: ["Price rules", "Preisregeln", "Règles de prix", "Reglas de precio"],
  notes: ["Shop notes", "Shopnotizen", "Notes de boutique", "Notas de tienda"],
  tickets: ["Tasks", "Aufgaben", "Tâches", "Tareas"],
  title: ["Title", "Titel", "Titre", "Título"],
  label: ["Label", "Bezeichnung", "Libellé", "Etiqueta"],
  note_id: [
    "Related note",
    "Zugehörige Notiz",
    "Note associée",
    "Nota relacionada",
  ],
  recordId: [
    "Record reference",
    "Datensatzreferenz",
    "Référence",
    "Referencia",
  ],
  personalizedOrders: [
    "Show personalized orders",
    "Personalisierte Bestellungen anzeigen",
    "Afficher les commandes personnalisées",
    "Mostrar pedidos personalizados",
  ],
  orderLabel: ["Order", "Bestellung", "Commande", "Pedido"],
  emptyOrders: [
    "No personalized orders yet",
    "Noch keine personalisierten Bestellungen",
    "Aucune commande personnalisée",
    "Aún no hay pedidos personalizados",
  ],
  proposed: [
    "Awaiting review",
    "Wartet auf Prüfung",
    "À examiner",
    "Pendiente de revisión",
  ],
  experiment: [
    "Marked for experiment",
    "Für Experiment vorgemerkt",
    "Expérience prévue",
    "Marcado para experimento",
  ],
  dismissed: ["Dismissed", "Verworfen", "Écarté", "Descartado"],
  failed: ["Failed", "Fehlgeschlagen", "Échec", "Fallido"],
  uncertain: [
    "Needs reconciliation",
    "Abgleich erforderlich",
    "Vérification requise",
    "Requiere verificación",
  ],
  published: [
    "Available in customer recommendations",
    "In Kundenempfehlungen verfügbar",
    "Disponible dans les recommandations",
    "Disponible en recomendaciones",
  ],
  publish: [
    "Approve for customer recommendations",
    "Für Kundenempfehlungen freigeben",
    "Approuver pour les recommandations",
    "Aprobar para recomendaciones",
  ],
  recommended: [
    "Chosen to go together",
    "Passend dazu ausgewählt",
    "Sélectionnés pour aller ensemble",
    "Seleccionados para combinar",
  ],
  expired: [
    "Payment expired",
    "Zahlung abgelaufen",
    "Paiement expiré",
    "Pago caducado",
  ],
  apps: [
    "Apps & payments",
    "Apps & Zahlungen",
    "Apps et paiements",
    "Apps y pagos",
  ],
  intro: [
    "Add capabilities to your shop. Each app keeps its own data and actions.",
    "Erweitere deinen Shop. Jede App hat eigene Daten und Aktionen.",
    "Ajoutez des fonctions à votre boutique, avec leurs données et actions.",
    "Añade funciones a tu tienda, con sus propios datos y acciones.",
  ],
  upgrade: ["Upgrade", "Aktualisieren", "Mettre à jour", "Actualizar"],
  configurationSaved: [
    "Configuration saved for this product",
    "Konfiguration für dieses Produkt gespeichert",
    "Configuration enregistrée pour ce produit",
    "Configuración guardada para este producto",
  ],
  install: ["Install", "Installieren", "Installer", "Instalar"],
  active: ["Active", "Aktiv", "Active", "Activa"],
  inactive: [
    "Inactive · data retained",
    "Inaktiv · Daten bleiben erhalten",
    "Inactive · données conservées",
    "Inactiva · datos conservados",
  ],
  enable: ["Enable", "Aktivieren", "Activer", "Activar"],
  disable: ["Disable", "Deaktivieren", "Désactiver", "Desactivar"],
  save: [
    "Review & save",
    "Prüfen & speichern",
    "Vérifier et enregistrer",
    "Revisar y guardar",
  ],
  records: ["App data", "App-Daten", "Données de l’app", "Datos de la app"],
  actions: [
    "App actions",
    "App-Aktionen",
    "Actions de l’app",
    "Acciones de la app",
  ],
  engraving: [
    "Personalize this product",
    "Produkt personalisieren",
    "Personnaliser ce produit",
    "Personalizar este producto",
  ],
  engravingHint: [
    "Up to 40 characters. The shop calculates the additional price and tax.",
    "Bis zu 40 Zeichen. Der Shop berechnet Aufpreis und Steuer.",
    "40 caractères maximum. La boutique calcule le supplément et la taxe.",
    "Hasta 40 caracteres. La tienda calcula el suplemento y el impuesto.",
  ],
  engravingSaved: [
    "Personalization saved for this product",
    "Personalisierung für dieses Produkt gespeichert",
    "Personnalisation enregistrée pour ce produit",
    "Personalización guardada para este producto",
  ],
  fee_minor: [
    "Fee in cents, per item",
    "Aufpreis in Cent, pro Stück",
    "Supplément en centimes, par article",
    "Suplemento en céntimos, por artículo",
  ],
  connected: [
    "Sandbox account configured",
    "Sandbox-Konto eingerichtet",
    "Compte sandbox configuré",
    "Cuenta sandbox configurada",
  ],
  missing: [
    "Connect this shop’s Sandbox account on the server to enable checkout.",
    "Sandbox-Konto dieses Shops auf dem Server verbinden, um Zahlungen zu aktivieren.",
    "Connectez le compte sandbox de cette boutique sur le serveur.",
    "Conecta la cuenta sandbox de esta tienda en el servidor.",
  ],
  contract: [
    "Shopware Payments requires its official connector contract. This app does not process payments yet.",
    "Für Shopware Payments fehlt der offizielle Anschlussvertrag. Diese App verarbeitet noch keine Zahlungen.",
    "Le contrat officiel de connexion Shopware Payments reste nécessaire. Cette app ne traite pas encore de paiements.",
    "Falta el contrato oficial de conexión de Shopware Payments. Esta app aún no procesa pagos.",
  ],
  sandbox: [
    "PayPal Sandbox · no real money",
    "PayPal Sandbox · kein echtes Geld",
    "PayPal Sandbox · aucun argent réel",
    "PayPal Sandbox · sin dinero real",
  ],
  pay: [
    "Continue to PayPal Sandbox",
    "Weiter zu PayPal Sandbox",
    "Continuer vers PayPal Sandbox",
    "Continuar a PayPal Sandbox",
  ],
  capture: [
    "Confirm approved payment",
    "Freigegebene Zahlung bestätigen",
    "Confirmer le paiement approuvé",
    "Confirmar el pago aprobado",
  ],
  cancel: [
    "Cancel payment",
    "Zahlung abbrechen",
    "Annuler le paiement",
    "Cancelar el pago",
  ],
  refresh: [
    "Refresh status",
    "Status aktualisieren",
    "Actualiser le statut",
    "Actualizar el estado",
  ],
  refund: [
    "Approve refund",
    "Erstattung freigeben",
    "Approuver le remboursement",
    "Aprobar el reembolso",
  ],
  refundAmount: [
    "Refund amount in cents",
    "Erstattung in Cent",
    "Remboursement en centimes",
    "Reembolso en céntimos",
  ],
  pending: [
    "Preparing payment",
    "Zahlung wird vorbereitet",
    "Préparation du paiement",
    "Preparando el pago",
  ],
  ready: [
    "Awaiting your approval at PayPal",
    "Wartet auf deine Freigabe bei PayPal",
    "En attente de votre accord chez PayPal",
    "Esperando tu aprobación en PayPal",
  ],
  approved: [
    "Approved · capture pending",
    "Freigegeben · Einzug ausstehend",
    "Approuvé · encaissement en attente",
    "Aprobado · cobro pendiente",
  ],
  captured: [
    "Payment confirmed",
    "Zahlung bestätigt",
    "Paiement confirmé",
    "Pago confirmado",
  ],
  partially_refunded: [
    "Partially refunded",
    "Teilweise erstattet",
    "Partiellement remboursé",
    "Reembolso parcial",
  ],
  refunded: ["Refunded", "Erstattet", "Remboursé", "Reembolsado"],
  cancelled: ["Cancelled", "Abgebrochen", "Annulé", "Cancelado"],
  captured_late: [
    "Late payment · merchant review required",
    "Späte Zahlung · Händlerprüfung erforderlich",
    "Paiement tardif · vérification requise",
    "Pago tardío · revisión necesaria",
  ],
  observed: [
    "What your shop has observed",
    "Was dein Shop beobachtet hat",
    "Ce que votre boutique a observé",
    "Lo que ha observado tu tienda",
  ],
  evidenceHint: [
    "Orders create associations with traceable evidence. They do not prove that a recommendation caused a purchase.",
    "Bestellungen erzeugen Zusammenhänge mit nachvollziehbaren Belegen. Sie beweisen nicht, dass eine Empfehlung einen Kauf verursacht hat.",
    "Les commandes créent des associations vérifiables, sans prouver un effet causal.",
    "Los pedidos generan asociaciones verificables, sin demostrar un efecto causal.",
  ],
  noEvidence: [
    "No product pairs observed yet. Place an order with two products to see the first association.",
    "Noch keine Produktpaare beobachtet. Eine Bestellung mit zwei Produkten erzeugt den ersten Zusammenhang.",
    "Aucune paire observée. Une commande de deux produits crée la première association.",
    "Aún no hay pares observados. Un pedido con dos productos genera la primera asociación.",
  ],
  orders: ["orders", "Bestellungen", "commandes", "pedidos"],
  simulated: [
    "simulated or sandbox",
    "simuliert oder Sandbox",
    "simulées ou sandbox",
    "simulados o sandbox",
  ],
  hypothesis: [
    "Idea to investigate",
    "Idee zum Prüfen",
    "Idée à étudier",
    "Idea para investigar",
  ],
  investigate: [
    "Mark for an experiment",
    "Für Experiment vormerken",
    "Prévoir une expérience",
    "Marcar para un experimento",
  ],
  dismiss: ["Dismiss", "Verwerfen", "Écarter", "Descartar"],
  marked: [
    "Marked for review. No experiment has been started automatically.",
    "Zur Prüfung vorgemerkt. Es wurde kein Experiment automatisch gestartet.",
    "Prévu pour examen. Aucune expérience n’a démarré automatiquement.",
    "Marcado para revisión. No se ha iniciado un experimento automáticamente.",
  ],
  source: [
    "Source event",
    "Quellereignis",
    "Événement source",
    "Evento de origen",
  ],
} as const;
export function useAppText() {
  const context = useLocale();
  const i =
    context.locale === "de-DE"
      ? 1
      : context.locale === "fr-FR"
        ? 2
        : context.locale === "es-ES"
          ? 3
          : 0;
  return {
    ...context,
    a: (key: string) => words[key as keyof typeof words]?.[i] ?? key,
  };
}
