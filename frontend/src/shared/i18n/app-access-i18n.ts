/** Explicit app callback consent and short-lived key management vocabulary. */
import { useLocale } from "./i18n";
const words = {
  installConsent: [
    "Review app permissions",
    "App-Berechtigungen prüfen",
    "Vérifier les permissions de l’app",
    "Revisar permisos de la app",
  ],
  installHint: [
    "Approve this exact package and the data it can access. New permissions are marked; callback keys still need separate approval.",
    "Gib genau dieses Paket und dessen Datenzugriff frei. Neue Rechte sind markiert; Callback-Schlüssel werden separat freigegeben.",
    "Autorisez ce paquet exact et ses accès. Les nouvelles permissions sont marquées ; les clés de rappel nécessitent une autorisation séparée.",
    "Autoriza este paquete exacto y sus accesos. Se marcan los permisos nuevos; las claves de callback requieren autorización independiente.",
  ],
  added: ["New", "Neu", "Nouveau", "Nuevo"],

  secretTitle: [
    "Service & webhook secrets",
    "Service- und Webhook-Schlüssel",
    "Secrets de service et webhook",
    "Secretos de servicio y webhook",
  ],
  secretHint: [
    "Stored encrypted for this shop and package only. Rotating replaces the previous value; upgrades need renewed approval.",
    "Verschlüsselt für diesen Shop und diese Paketversion. Rotation ersetzt den alten Wert; nach Updates ist eine neue Freigabe nötig.",
    "Chiffrés pour ce shop et cette version uniquement. La rotation remplace la valeur ; les mises à jour nécessitent une nouvelle autorisation.",
    "Cifrados solo para esta tienda y versión. La rotación reemplaza el valor; las actualizaciones requieren nueva autorización.",
  ],
  service: [
    "Service access token",
    "Service-Zugriffsschlüssel",
    "Jeton de service",
    "Token de servicio",
  ],
  webhook: [
    "Incoming webhook signing secret",
    "Signierschlüssel für eingehende Webhooks",
    "Secret de signature des webhooks entrants",
    "Secreto de firma de webhooks entrantes",
  ],
  outbound: [
    "Outgoing webhook signing secret",
    "Signierschlüssel für ausgehende Webhooks",
    "Secret de signature des webhooks sortants",
    "Secreto de firma de webhooks salientes",
  ],
  rotate: [
    "Approve & rotate",
    "Freigeben & rotieren",
    "Autoriser et renouveler",
    "Autorizar y rotar",
  ],
  rotateHint: [
    "The previous value stops working immediately. Update the matching app service or sender.",
    "Der bisherige Wert wird sofort ungültig. Aktualisiere den zugehörigen App-Dienst oder Absender.",
    "L’ancienne valeur devient immédiatement invalide. Actualisez le service ou l’expéditeur correspondant.",
    "El valor anterior deja de funcionar inmediatamente. Actualiza el servicio o remitente correspondiente.",
  ],
  encryptedUnavailable: [
    "The platform encryption key is missing. Ask the operator to configure it.",
    "Der Plattform-Schlüssel für Verschlüsselung fehlt. Bitte den Betreiber um Einrichtung.",
    "La clé de chiffrement de la plateforme manque. Demandez sa configuration à l’opérateur.",
    "Falta la clave de cifrado de la plataforma. Solicita su configuración al operador.",
  ],
  rotated: [
    "Secret rotated",
    "Schlüssel rotiert",
    "Secret renouvelé",
    "Secreto rotado",
  ],
  secretValue: [
    "New secret (32–4096 characters)",
    "Neuer Schlüssel (32–4096 Zeichen)",
    "Nouveau secret (32–4096 caractères)",
    "Nuevo secreto (32–4096 caracteres)",
  ],

  title: [
    "Core data access",
    "Zugriff auf Shopdaten",
    "Accès aux données du shop",
    "Acceso a datos de la tienda",
  ],
  hint: [
    "Allow only the data this app needs. Keys are bound to this shop, your current rights and this package version. An update or deactivation invalidates them.",
    "Gib nur die benötigten Daten frei. Schlüssel gelten für diesen Shop, deine aktuellen Rechte und diese Paketversion. Updates oder Deaktivierung machen sie ungültig.",
    "Autorisez uniquement les données nécessaires. Les clés dépendent de ce shop, de vos droits actuels et de cette version. Une mise à jour ou désactivation les invalide.",
    "Autoriza solo los datos necesarios. Las claves dependen de esta tienda, tus permisos actuales y esta versión. Una actualización o desactivación las invalida.",
  ],
  create: [
    "Approve & create key",
    "Freigeben & Schlüssel erstellen",
    "Autoriser et créer une clé",
    "Autorizar y crear clave",
  ],
  days: [
    "Valid for days",
    "Gültigkeit in Tagen",
    "Validité en jours",
    "Validez en días",
  ],
  secret: [
    "Copy now and store only on your app server. This key will not be shown again.",
    "Jetzt kopieren und nur auf deinem App-Server speichern. Dieser Schlüssel wird nicht erneut angezeigt.",
    "Copiez maintenant et stockez uniquement sur votre serveur d’app. Cette clé ne sera plus affichée.",
    "Copia ahora y guarda solo en el servidor de tu app. Esta clave no se mostrará de nuevo.",
  ],
  revoke: ["Revoke", "Widerrufen", "Révoquer", "Revocar"],
  revokeHint: [
    "This app key stops working immediately. Other keys remain valid.",
    "Dieser App-Schlüssel funktioniert sofort nicht mehr. Andere Schlüssel bleiben gültig.",
    "Cette clé cesse de fonctionner immédiatement. Les autres restent valides.",
    "Esta clave deja de funcionar inmediatamente. Las demás siguen siendo válidas.",
  ],
  none: [
    "No keys created",
    "Noch keine Schlüssel erstellt",
    "Aucune clé créée",
    "Aún no hay claves",
  ],
  expired: [
    "Expired or outdated package",
    "Abgelaufen oder ältere Paketversion",
    "Expirée ou ancienne version",
    "Caducada o versión anterior",
  ],
  "orders.read": [
    "Order amounts and states",
    "Bestellbeträge und Status",
    "Montants et états des commandes",
    "Importes y estados de pedidos",
  ],
  "customers.read": [
    "Customer account metadata",
    "Metadaten von Kundenkonten",
    "Métadonnées des comptes clients",
    "Metadatos de cuentas de clientes",
  ],
  "customers.pii": [
    "Personal data, addresses and order details",
    "Personendaten, Adressen und Bestelldetails",
    "Données personnelles, adresses et détails",
    "Datos personales, direcciones y detalles",
  ],
  "products.read": [
    "Product content",
    "Produktinhalte",
    "Contenu des produits",
    "Contenido de productos",
  ],
  "products.write": [
    "Edit products with revision checks",
    "Produkte mit Versionsprüfung bearbeiten",
    "Modifier les produits avec contrôle de version",
    "Editar productos con control de versión",
  ],
} as const;
export type CallbackPermission =
  | "orders.read"
  | "customers.read"
  | "customers.pii"
  | "products.read"
  | "products.write";
export function useAppAccessText() {
  const { locale } = useLocale();
  const index = locale.startsWith("de")
    ? 1
    : locale.startsWith("fr")
      ? 2
      : locale.startsWith("es")
        ? 3
        : 0;
  return (key: keyof typeof words) => words[key][index];
}
