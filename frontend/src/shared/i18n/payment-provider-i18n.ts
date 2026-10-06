/** Payment contract editor and account onboarding vocabulary. */
import { useLocale } from "./i18n";
export const paymentProviderWords = {
  disconnect: [
    "Disconnect account",
    "Konto trennen",
    "Déconnecter le compte",
    "Desconectar cuenta",
  ],
  disconnectHint: [
    "New checkouts for this channel will stop using this account. Existing payments retain their original account for refunds and reconciliation.",
    "Neue Checkouts dieses Kanals verwenden dieses Konto nicht mehr. Bestehende Zahlungen behalten ihr ursprüngliches Konto für Erstattungen und Abgleich.",
    "Les nouveaux paiements de ce canal n’utiliseront plus ce compte. Les paiements existants conservent leur compte pour les remboursements et rapprochements.",
    "Los nuevos pagos de este canal dejarán de usar esta cuenta. Los pagos existentes conservan su cuenta para reembolsos y conciliación.",
  ],
  environment: ["Environment", "Umgebung", "Environnement", "Entorno"],
  sandbox: ["Test account", "Testkonto", "Compte de test", "Cuenta de prueba"],
  live: ["Live account", "Live-Konto", "Compte réel", "Cuenta real"],
  title: [
    "Payment provider",
    "Zahlungsanbieter",
    "Prestataire de paiement",
    "Proveedor de pagos",
  ],
  hint: [
    "Define methods here; the isolated provider service handles money. Installation alone does not enable checkout.",
    "Definiere hier Zahlungsarten; der isolierte Anbieter-Dienst verarbeitet Zahlungen. Installation allein aktiviert keinen Checkout.",
    "Définissez les moyens de paiement ; le service isolé traite les paiements. L’installation seule n’active pas le paiement.",
    "Define los métodos; el servicio aislado procesa pagos. Instalar no activa el pago.",
  ],
  enable: [
    "Add provider contract",
    "Anbieter-Vertrag hinzufügen",
    "Ajouter un contrat",
    "Añadir contrato",
  ],
  method: [
    "Payment method",
    "Zahlungsart",
    "Moyen de paiement",
    "Método de pago",
  ],
  add: [
    "Add method",
    "Zahlungsart hinzufügen",
    "Ajouter un moyen",
    "Añadir método",
  ],
  remove: [
    "Remove from draft",
    "Aus Entwurf entfernen",
    "Retirer du brouillon",
    "Eliminar del borrador",
  ],
  id: ["Reference", "Referenz", "Référence", "Referencia"],
  name: ["Name", "Name", "Nom", "Nombre"],
  currency: [
    "Currencies (ISO codes)",
    "Währungen (ISO-Codes)",
    "Devises (codes ISO)",
    "Monedas (códigos ISO)",
  ],
  countries: [
    "Available countries — empty means unrestricted",
    "Verfügbare Länder — leer bedeutet uneingeschränkt",
    "Pays disponibles — vide signifie sans restriction",
    "Países disponibles — vacío significa sin restricciones",
  ],
  checkout: [
    "Checkout surface",
    "Checkout-Oberfläche",
    "Interface de paiement",
    "Interfaz de pago",
  ],
  redirect: [
    "Provider redirect",
    "Weiterleitung zum Anbieter",
    "Redirection vers le prestataire",
    "Redirección al proveedor",
  ],
  embedded: [
    "Isolated embedded checkout",
    "Isolierter eingebetteter Checkout",
    "Paiement intégré isolé",
    "Pago integrado aislado",
  ],
  intent: [
    "After approval",
    "Nach Freigabe",
    "Après approbation",
    "Después de la aprobación",
  ],
  capture: [
    "Capture payment",
    "Zahlung einziehen",
    "Capturer le paiement",
    "Capturar pago",
  ],
  authorize: [
    "Authorize first",
    "Zuerst autorisieren",
    "Autoriser d’abord",
    "Autorizar primero",
  ],
  refund: ["Refunds", "Erstattungen", "Remboursements", "Reembolsos"],
  void: [
    "Void authorization",
    "Autorisierung aufheben",
    "Annuler l’autorisation",
    "Anular autorización",
  ],
  recurring: [
    "Recurring payments",
    "Wiederkehrende Zahlungen",
    "Paiements récurrents",
    "Pagos recurrentes",
  ],
  vault: [
    "Saved payment methods",
    "Gespeicherte Zahlungsarten",
    "Moyens enregistrés",
    "Métodos guardados",
  ],
  account: [
    "Account connection",
    "Kontoverbindung",
    "Connexion du compte",
    "Conexión de cuenta",
  ],
  channel: [
    "Sales channel",
    "Verkaufskanal",
    "Canal de vente",
    "Canal de venta",
  ],
  refresh: [
    "Check connection",
    "Verbindung prüfen",
    "Vérifier la connexion",
    "Comprobar conexión",
  ],
  start: [
    "Start onboarding",
    "Einrichtung starten",
    "Commencer la configuration",
    "Iniciar configuración",
  ],
  continue: [
    "Continue with provider",
    "Beim Anbieter fortfahren",
    "Continuer chez le prestataire",
    "Continuar con proveedor",
  ],
  ready: [
    "Account ready. Enable its methods in Settings → Payment methods.",
    "Konto bereit. Aktiviere die Zahlungsarten unter Einstellungen → Zahlungsarten.",
    "Compte prêt. Activez les moyens dans Paramètres → Paiement.",
    "Cuenta lista. Activa los métodos en Configuración → Métodos de pago.",
  ],
  pending: [
    "Account not ready yet",
    "Konto noch nicht bereit",
    "Compte pas encore prêt",
    "Cuenta aún no lista",
  ],
  country: [
    "Business country",
    "Unternehmensland",
    "Pays de l’entreprise",
    "País de la empresa",
  ],
  deploy: [
    "Deploy and configure the versioned service before connecting an account. Secrets stay on the server.",
    "Stelle den versionierten Dienst bereit und konfiguriere ihn, bevor du ein Konto verbindest. Geheimnisse bleiben auf dem Server.",
    "Déployez et configurez le service versionné avant de connecter un compte. Les secrets restent sur le serveur.",
    "Despliega y configura el servicio versionado antes de conectar una cuenta. Los secretos permanecen en el servidor.",
  ],
} as const;
export function usePaymentProviderText() {
  const { locale } = useLocale();
  const n = locale.startsWith("de")
    ? 1
    : locale.startsWith("fr")
      ? 2
      : locale.startsWith("es")
        ? 3
        : 0;
  return (k: keyof typeof paymentProviderWords) => paymentProviderWords[k][n];
}
