/** Complete mail workspace vocabulary in English, German, French and Spanish. */
import { useLocale } from "./i18n";
export const emailWords: Record<string, readonly string[]> = {
  removeCredentials: [
    "Remove credentials and disable delivery",
    "Zugangsdaten entfernen und Versand deaktivieren",
    "Supprimer les identifiants et désactiver l’envoi",
    "Eliminar credenciales y desactivar envíos",
  ],
  title: [
    "Email delivery",
    "E-Mail-Versand",
    "Envoi d’e-mails",
    "Envío de correos",
  ],
  hint: [
    "One delivery service for your shop, apps and flows.",
    "Ein Versanddienst für deinen Shop, Apps und Flows.",
    "Un service d’envoi pour votre boutique, applications et flux.",
    "Un servicio de envío para tu tienda, aplicaciones y flujos.",
  ],
  provider: ["Provider", "Anbieter", "Fournisseur", "Proveedor"],
  fromEmail: [
    "Sender email",
    "Absenderadresse",
    "Adresse d’expéditeur",
    "Correo del remitente",
  ],
  fromName: [
    "Sender name",
    "Absendername",
    "Nom d’expéditeur",
    "Nombre del remitente",
  ],
  replyTo: [
    "Reply-to address",
    "Antwortadresse",
    "Adresse de réponse",
    "Dirección de respuesta",
  ],
  smtpHost: ["SMTP host", "SMTP-Server", "Serveur SMTP", "Servidor SMTP"],
  smtpPort: ["Port", "Port", "Port", "Puerto"],
  smtpSecurity: ["Encryption", "Verschlüsselung", "Chiffrement", "Cifrado"],
  smtpUsername: [
    "SMTP username",
    "SMTP-Benutzername",
    "Utilisateur SMTP",
    "Usuario SMTP",
  ],
  smtpPassword: [
    "SMTP password",
    "SMTP-Passwort",
    "Mot de passe SMTP",
    "Contraseña SMTP",
  ],
  apiKey: ["API key", "API-Schlüssel", "Clé API", "Clave API"],
  secrets: [
    "Credentials are stored encrypted. Empty fields keep the existing secret.",
    "Zugangsdaten werden verschlüsselt gespeichert. Leere Felder behalten das bisherige Geheimnis.",
    "Les identifiants sont chiffrés. Un champ vide conserve le secret existant.",
    "Las credenciales se cifran. Los campos vacíos conservan el secreto existente.",
  ],
  approval: [
    "Your operator must approve the SMTP hostname. TLS is required for live delivery.",
    "Der Betreiber muss den SMTP-Server freigeben. Echter Versand benötigt TLS.",
    "L’opérateur doit autoriser le serveur SMTP. TLS est obligatoire pour l’envoi réel.",
    "El operador debe autorizar el servidor SMTP. TLS es obligatorio para envíos reales.",
  ],
  configured: [
    "Credential saved",
    "Zugangsdaten gespeichert",
    "Identifiant enregistré",
    "Credencial guardada",
  ],
  region: [
    "SendGrid region",
    "SendGrid-Region",
    "Région SendGrid",
    "Región SendGrid",
  ],
  global: ["Global", "Global", "Mondial", "Global"],
  eu: [
    "European Union",
    "Europäische Union",
    "Union européenne",
    "Unión Europea",
  ],
  enabled: [
    "Enable delivery",
    "Versand aktivieren",
    "Activer l’envoi",
    "Activar envíos",
  ],
  dryRun: [
    "Test mode — no external emails",
    "Testmodus – keine externen E-Mails",
    "Mode test — aucun e-mail externe",
    "Modo prueba — sin correos externos",
  ],
  automatic: [
    "Send an order confirmation automatically",
    "Bestellbestätigung automatisch senden",
    "Envoyer automatiquement une confirmation de commande",
    "Enviar confirmación del pedido automáticamente",
  ],
  save: [
    "Save configuration",
    "Konfiguration speichern",
    "Enregistrer la configuration",
    "Guardar configuración",
  ],
  refresh: ["Refresh", "Aktualisieren", "Actualiser", "Actualizar"],
  templates: [
    "Order confirmation",
    "Bestellbestätigung",
    "Confirmation de commande",
    "Confirmación del pedido",
  ],
  locale: [
    "Default email language",
    "Standard-E-Mail-Sprache",
    "Langue par défaut des e-mails",
    "Idioma predeterminado del correo",
  ],
  language: [
    "Template language",
    "Vorlagensprache",
    "Langue du modèle",
    "Idioma de plantilla",
  ],
  subject: ["Subject", "Betreff", "Objet", "Asunto"],
  text: ["Message", "Nachricht", "Message", "Mensaje"],
  html: [
    "HTML alternative (optional)",
    "HTML-Version (optional)",
    "Version HTML (facultatif)",
    "Versión HTML (opcional)",
  ],
  variables: [
    "Variables: {firstName}, {orderNumber}, {totalPrice}, {currency}.",
    "Variablen: {firstName}, {orderNumber}, {totalPrice}, {currency}.",
    "Variables : {firstName}, {orderNumber}, {totalPrice}, {currency}.",
    "Variables: {firstName}, {orderNumber}, {totalPrice}, {currency}.",
  ],
  test: [
    "Preview & test",
    "Vorschau & Test",
    "Aperçu et test",
    "Vista previa y prueba",
  ],
  recipient: [
    "Test recipient",
    "Testempfänger",
    "Destinataire du test",
    "Destinatario de prueba",
  ],
  preview: [
    "Preview email",
    "E-Mail-Vorschau",
    "Aperçu de l’e-mail",
    "Vista previa del correo",
  ],
  simulate: [
    "Queue a test without sending",
    "Test ohne Versand starten",
    "Tester sans envoyer",
    "Probar sin enviar",
  ],
  send: [
    "Send a real test email",
    "Echte Test-E-Mail senden",
    "Envoyer un vrai e-mail de test",
    "Enviar un correo de prueba real",
  ],
  savedFirst: [
    "Save changes before testing.",
    "Änderungen vor dem Test speichern.",
    "Enregistrez les modifications avant le test.",
    "Guarda los cambios antes de probar.",
  ],
  jobs: [
    "Delivery history",
    "Versandverlauf",
    "Historique d’envoi",
    "Historial de envíos",
  ],
  empty: [
    "No delivery jobs yet.",
    "Noch keine Versandaufträge.",
    "Aucun envoi pour le moment.",
    "Todavía no hay envíos.",
  ],
  receipt: [
    "Accepted by the provider does not confirm arrival in the inbox.",
    "Vom Anbieter angenommen bedeutet noch keine bestätigte Zustellung im Posteingang.",
    "L’acceptation du fournisseur ne confirme pas la réception dans la boîte mail.",
    "La aceptación del proveedor no confirma la llegada a la bandeja de entrada.",
  ],
  queued: ["Queued", "In Warteschlange", "En attente", "En cola"],
  running: ["Sending", "Wird versendet", "Envoi en cours", "Enviando"],
  accepted: [
    "Provider accepted",
    "Vom Anbieter angenommen",
    "Accepté par le fournisseur",
    "Aceptado por el proveedor",
  ],
  dry_run: [
    "Test complete · no email sent",
    "Test abgeschlossen · keine E-Mail versendet",
    "Test terminé · aucun e-mail envoyé",
    "Prueba completada · sin correo enviado",
  ],
  failed: [
    "Failed — check configuration",
    "Fehlgeschlagen – Konfiguration prüfen",
    "Échec — vérifiez la configuration",
    "Error — revisa la configuración",
  ],
  uncertain: [
    "Unconfirmed — inspect provider before resending",
    "Unbestätigt – vor erneutem Versand Anbieter prüfen",
    "Non confirmé — vérifiez le fournisseur avant de renvoyer",
    "Sin confirmar — revisa el proveedor antes de reenviar",
  ],
  completed: ["Completed", "Abgeschlossen", "Terminé", "Completado"],
  error: [
    "Operation failed. Check configuration and access rights.",
    "Aktion fehlgeschlagen. Konfiguration und Zugriffsrechte prüfen.",
    "Échec de l’opération. Vérifiez la configuration et les droits.",
    "La operación falló. Revisa la configuración y los permisos.",
  ],
};
export function useEmailText() {
  const { locale } = useLocale();
  const index = locale.startsWith("de")
    ? 1
    : locale.startsWith("fr")
      ? 2
      : locale.startsWith("es")
        ? 3
        : 0;
  return { e: (key: string) => emailWords[key]?.[index] ?? key };
}
