/** Four-language navigation copy; mounted frontends are connections, not proof of publication. */
import { useLocale } from "../../shared/i18n/i18n";
export const storyfrontWords = {
  managed: [
    "Managed by Experience",
    "Von Experience verwaltet",
    "Gérée par Experience",
    "Gestionada por Experience",
  ],
  managedHint: [
    "Storyfront is installed automatically for your connected experiences. Disconnect their frontend bindings before pausing this app.",
    "Storyfront ist für deine verbundenen Experiences automatisch installiert. Entferne deren Frontend-Verbindungen, bevor du diese App pausierst.",
    "Storyfront est installée automatiquement pour vos expériences connectées. Déconnectez leurs frontends avant de mettre cette app en pause.",
    "Storyfront se instala automáticamente para tus experiencias conectadas. Desconecta sus frontends antes de pausar esta app.",
  ],
  connected: [
    "Connected experience",
    "Verbundene Experience",
    "Expérience connectée",
    "Experiencia conectada",
  ],
  channel: [
    "Sales channel",
    "Verkaufskanal",
    "Canal de vente",
    "Canal de venta",
  ],
  open: ["Open shop", "Shop öffnen", "Ouvrir la boutique", "Abrir tienda"],
  edit: [
    "Edit experience",
    "Experience bearbeiten",
    "Modifier l’expérience",
    "Editar experiencia",
  ],
  refresh: [
    "Refresh connections",
    "Verbindungen aktualisieren",
    "Actualiser les connexions",
    "Actualizar conexiones",
  ],
  loading: [
    "Loading your experiences…",
    "Deine Experiences werden geladen…",
    "Chargement de vos expériences…",
    "Cargando tus experiencias…",
  ],
  failed: [
    "Connections could not be loaded. Try again.",
    "Verbindungen konnten nicht geladen werden. Bitte erneut versuchen.",
    "Impossible de charger les connexions. Réessayez.",
    "No se pudieron cargar las conexiones. Inténtalo de nuevo.",
  ],
  hint: [
    "These experiences use this shop’s catalog and checkout. Open their existing editor to change presentation; publishing remains a separate action.",
    "Diese Experiences verwenden den Katalog und Checkout dieses Shops. Bearbeite die Gestaltung im bestehenden Editor; die Veröffentlichung bleibt ein eigener Schritt.",
    "Ces expériences utilisent le catalogue et le paiement de cette boutique. Modifiez la présentation dans l’éditeur existant ; la publication reste une action distincte.",
    "Estas experiencias usan el catálogo y checkout de esta tienda. Edita su presentación en el editor existente; publicar sigue siendo una acción separada.",
  ],
  editorMissing: [
    "The operator has not configured the editor link yet.",
    "Der Betreiber hat den Editor-Link noch nicht konfiguriert.",
    "L’opérateur n’a pas encore configuré le lien de l’éditeur.",
    "El operador aún no ha configurado el enlace del editor.",
  ],
  connector: [
    "Additional Storyfront connector",
    "Zusätzlicher Storyfront-Connector",
    "Connecteur Storyfront supplémentaire",
    "Conector Storyfront adicional",
  ],
} as const;
export function useStoryfrontText() {
  const { locale } = useLocale();
  const index =
    locale === "de-DE"
      ? 1
      : locale === "fr-FR"
        ? 2
        : locale === "es-ES"
          ? 3
          : 0;
  return (key: keyof typeof storyfrontWords) => storyfrontWords[key][index];
}
