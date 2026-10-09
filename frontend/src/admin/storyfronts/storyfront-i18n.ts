/** Four-language navigation copy; mounted frontends are connections, not proof of publication. */
import { useLocale } from "../../shared/i18n/i18n";
export const storyfrontWords = {
  setupMissing: [
    "Storyfront is installed, but its workspace is not available yet. The operator must configure the Storyfront service for this shop. Installing the app alone does not create an experience.",
    "Storyfront ist installiert, aber der Arbeitsbereich ist noch nicht verfügbar. Der Betreiber muss den Storyfront-Dienst für diesen Shop konfigurieren. Die App-Installation allein erstellt keine Experience.",
    "Storyfront est installée, mais son espace de travail n’est pas encore disponible. L’opérateur doit configurer le service Storyfront pour cette boutique. Installer l’app seule ne crée pas d’expérience.",
    "Storyfront está instalada, pero su espacio de trabajo aún no está disponible. El operador debe configurar el servicio Storyfront para esta tienda. Instalar la app por sí sola no crea una experiencia.",
  ],
  activationFailed: [
    "Storyfront could not be activated. Please review the error and try again.",
    "Storyfront konnte nicht aktiviert werden. Prüfe den Fehler und versuche es erneut.",
    "Storyfront n’a pas pu être activée. Vérifiez l’erreur et réessayez.",
    "No se pudo activar Storyfront. Revisa el error e inténtalo de nuevo.",
  ],
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
