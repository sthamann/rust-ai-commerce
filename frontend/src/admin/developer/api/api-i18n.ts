/** Four-language developer API console vocabulary; no credentials are persisted in UI storage. */
import { useLocale } from "../../../shared/i18n/i18n";
const words = {
  studio: ["App Studio", "App Studio", "App Studio", "App Studio"],
  console: [
    "API & integrations",
    "API & Integrationen",
    "API et intégrations",
    "API e integraciones",
  ],
  intro: [
    "One Rust backend for storefront, Studio, MCP and apps. Every request is checked for shop and permissions.",
    "Ein Rust-Backend für Storefront, Studio, MCP und Apps. Jede Anfrage wird auf Shop und Berechtigungen geprüft.",
    "Un backend Rust pour la boutique, Studio, MCP et les apps. Chaque requête est contrôlée par boutique et droits.",
    "Un backend Rust para tienda, Studio, MCP y apps. Cada petición comprueba tienda y permisos.",
  ],
  keys: [
    "Integration keys",
    "Integrationsschlüssel",
    "Clés d’intégration",
    "Claves de integración",
  ],
  name: [
    "Key name",
    "Name des Schlüssels",
    "Nom de la clé",
    "Nombre de la clave",
  ],
  days: [
    "Validity in days (1–90)",
    "Gültigkeit in Tagen (1–90)",
    "Validité en jours (1–90)",
    "Validez en días (1–90)",
  ],
  rights: [
    "Granted permissions",
    "Erteilte Rechte",
    "Droits accordés",
    "Permisos concedidos",
  ],
  create: ["Create key", "Schlüssel erstellen", "Créer la clé", "Crear clave"],
  revoke: [
    "Revoke key",
    "Schlüssel widerrufen",
    "Révoquer la clé",
    "Revocar clave",
  ],
  revokeHint: [
    "Connected integrations will lose access immediately.",
    "Verbundene Integrationen verlieren sofort den Zugriff.",
    "Les intégrations perdent immédiatement l’accès.",
    "Las integraciones perderán acceso de inmediato.",
  ],
  once: [
    "Shown once. Copy securely; closing this view clears the plaintext key.",
    "Einmalige Anzeige. Sicher kopieren; beim Schließen wird der Klartextschlüssel verworfen.",
    "Affichage unique. Copiez en lieu sûr ; fermer efface la clé en clair.",
    "Se muestra una vez. Copia de forma segura; cerrar elimina la clave visible.",
  ],
  copy: ["Copy key", "Schlüssel kopieren", "Copier la clé", "Copiar clave"],
  clear: ["Clear key", "Schlüssel verwerfen", "Effacer la clé", "Borrar clave"],
  expiry: ["Expires", "Gültig bis", "Expire", "Caduca"],
  expired: ["Expired", "Abgelaufen", "Expirée", "Caducada"],
  manageHint: [
    "Managing keys requires team.manage. Scopes are always intersected with the creator’s current membership.",
    "Schlüsselverwaltung benötigt team.manage. Rechte werden immer mit den aktuellen Mitgliedsrechten des Erstellers abgeglichen.",
    "La gestion nécessite team.manage. Les droits sont limités aux droits actuels du créateur.",
    "La gestión requiere team.manage. Los permisos se limitan a los derechos actuales del creador.",
  ],
  routes: [
    "Endpoint explorer",
    "API-Explorer",
    "Explorateur d’API",
    "Explorador de API",
  ],
  search: [
    "Search API path or method",
    "API-Pfad oder Methode suchen",
    "Rechercher chemin ou méthode",
    "Buscar ruta o método",
  ],
  test: [
    "Run read request",
    "Leseanfrage ausführen",
    "Exécuter la lecture",
    "Ejecutar lectura",
  ],
  key: [
    "Optional integration key for this test",
    "Optionaler Integrationsschlüssel für diesen Test",
    "Clé d’intégration facultative pour le test",
    "Clave de integración opcional para esta prueba",
  ],
  testing: ["Testing…", "Wird getestet…", "Test en cours…", "Probando…"],
  readOnly: [
    "Live testing is limited to read operations. Write routes are documented here and use explicit merchant actions elsewhere.",
    "Live-Tests sind auf Leseoperationen begrenzt. Schreiboperationen sind hier dokumentiert und werden über explizite Händleraktionen ausgeführt.",
    "Les tests sont limités aux lectures. Les écritures sont documentées et exécutées par des actions explicites.",
    "Las pruebas se limitan a lecturas. Las escrituras están documentadas y usan acciones explícitas.",
  ],
  result: ["Response", "Antwort", "Réponse", "Respuesta"],
  scope: [
    "Current shop",
    "Aktueller Shop",
    "Boutique actuelle",
    "Tienda actual",
  ],
  protocol: [
    "MCP discovery",
    "MCP-Erkundung",
    "Découverte MCP",
    "Descubrimiento MCP",
  ],
  apps: [
    "Shop-specific app routes",
    "Shop-spezifische App-Routen",
    "Routes d’apps de la boutique",
    "Rutas de apps de la tienda",
  ],
  copied: ["Copied", "Kopiert", "Copié", "Copiada"],
} as const;
export function useApiText() {
  const { locale } = useLocale();
  return (k: keyof typeof words) =>
    words[k][{ "en-GB": 0, "de-DE": 1, "fr-FR": 2, "es-ES": 3 }[locale]];
}
