/** Domain lifecycle copy in every supported Studio language. */
import { useLocale } from "../../shared/i18n/i18n";
const words = {
  title: [
    "Domains & experiences",
    "Domains & Experiences",
    "Domaines et expériences",
    "Dominios y experiencias",
  ],
  hint: [
    "Each address uses this channel’s catalog, settings and checkout. Edit Storyfront in its existing editor.",
    "Jede Adresse verwendet Katalog, Einstellungen und Checkout dieses Kanals. Bearbeite Storyfront im bestehenden Editor.",
    "Chaque adresse utilise le catalogue, les réglages et le paiement du canal. Modifiez Storyfront dans son éditeur.",
    "Cada dirección usa el catálogo, ajustes y pago del canal. Edita Storyfront en su editor.",
  ],
  empty: [
    "No Experience domain connected. Connect Storyfront or select an existing Experience below.",
    "Noch keine Experience-Domain verbunden. Verbinde Storyfront oder wähle unten eine vorhandene Experience.",
    "Aucun domaine connecté. Connectez Storyfront ou choisissez une expérience.",
    "Sin dominio conectado. Conecta Storyfront o elige una experiencia.",
  ],
  domain: ["Subdomain", "Subdomain", "Sous-domaine", "Subdominio"],
  experience: [
    "Connected Experience",
    "Verbundene Experience",
    "Expérience connectée",
    "Experience conectada",
  ],
  channel: [
    "Assigned sales channel",
    "Zugeordneter Verkaufskanal",
    "Canal affecté",
    "Canal asignado",
  ],
  add: [
    "Connect additional address",
    "Weitere Adresse verbinden",
    "Connecter une adresse",
    "Conectar otra dirección",
  ],
  save: [
    "Save connection",
    "Verbindung speichern",
    "Enregistrer la connexion",
    "Guardar conexión",
  ],
  edit: [
    "Edit Storyfront",
    "Storyfront bearbeiten",
    "Modifier Storyfront",
    "Editar Storyfront",
  ],
  open: ["Open shop", "Shop öffnen", "Ouvrir la boutique", "Abrir tienda"],
  disconnect: [
    "Disconnect address",
    "Adresse trennen",
    "Déconnecter l’adresse",
    "Desconectar dirección",
  ],
  disconnectHint: [
    "This removes Experience routing, not products, orders or the Experience. The shop’s main domain may return to the standard storefront.",
    "Das entfernt die Experience-Verbindung, nicht Produkte, Bestellungen oder die Experience. Die Hauptdomain kann wieder die Standard-Storefront anzeigen.",
    "La connexion est supprimée, pas les produits, commandes ou l’expérience. Le domaine principal peut revenir à la boutique standard.",
    "Se elimina la conexión, no productos, pedidos ni la experiencia. El dominio principal puede volver a la tienda estándar.",
  ],
  hosting: [
    "Platform wildcard addresses are managed here. External custom domains require operator DNS and certificates.",
    "Hier verwaltest du Adressen der Plattform-Wildcard-Domain. Externe eigene Domains benötigen DNS und Zertifikate durch den Betreiber.",
    "Gérez ici les adresses wildcard. Les domaines externes nécessitent DNS et certificats par l’opérateur.",
    "Gestiona aquí direcciones wildcard. Los dominios externos requieren DNS y certificados del operador.",
  ],
  error: [
    "Connection failed. Reload to check version, address ownership and service configuration.",
    "Verbindung fehlgeschlagen. Prüfe nach dem Aktualisieren Version, Adressverfügbarkeit und Dienstkonfiguration.",
    "Connexion impossible. Actualisez pour vérifier version, adresse et configuration.",
    "Conexión fallida. Actualiza para comprobar versión, dirección y configuración.",
  ],
  loading: [
    "Loading connections…",
    "Verbindungen werden geladen…",
    "Chargement des connexions…",
    "Cargando conexiones…",
  ],
  saved: [
    "Connection saved",
    "Verbindung gespeichert",
    "Connexion enregistrée",
    "Conexión guardada",
  ],
} as const;
export function useConnectionText() {
  const { locale } = useLocale();
  return (k: keyof typeof words) =>
    words[k][{ "en-GB": 0, "de-DE": 1, "fr-FR": 2, "es-ES": 3 }[locale]];
}
