/** Consent-bound private shopping-memory controls use typed interface text, separate from merchant product facts. */
import { useLocale } from "./i18n";
const words = {
  title: [
    "Your shopping preferences",
    "Deine Einkaufspräferenzen",
    "Vos préférences d’achat",
    "Tus preferencias de compra",
  ],
  scope: [
    "Saved only for this browser cart context, for 30 days of advice use. These are your preferences, not verified product facts. Personalization consent is required; withdrawing it erases this memory.",
    "Gespeichert für diesen Warenkorb-Kontext im Browser; für die Beratung 30 Tage nutzbar. Dies sind deine Präferenzen, keine bestätigten Produktfakten. Erforderlich ist eine Einwilligung zur Personalisierung; ihr Widerruf löscht dieses Gedächtnis.",
    "Enregistrées pour ce panier du navigateur, utilisables 30 jours pour les conseils. Ce sont vos préférences, pas des faits produit vérifiés. Le consentement à la personnalisation est nécessaire ; son retrait efface cette mémoire.",
    "Guardadas para este carrito del navegador y disponibles 30 días para asesoramiento. Son tus preferencias, no hechos verificados del producto. Se requiere consentimiento para personalización; retirarlo borra esta memoria.",
  ],
  size: [
    "Preferred size",
    "Bevorzugte Größe",
    "Taille préférée",
    "Talla preferida",
  ],
  style: ["Your style", "Dein Stil", "Votre style", "Tu estilo"],
  share: [
    "Use these preferences with the configured AI advisor",
    "Diese Präferenzen mit der eingerichteten KI-Beratung verwenden",
    "Utiliser ces préférences avec le conseiller IA configuré",
    "Usar estas preferencias con el asesor IA configurado",
  ],
  save: [
    "Save preferences",
    "Präferenzen speichern",
    "Enregistrer les préférences",
    "Guardar preferencias",
  ],
  remove: [
    "Erase this memory",
    "Dieses Gedächtnis löschen",
    "Effacer cette mémoire",
    "Borrar esta memoria",
  ],
  export: [
    "Export private graph",
    "Privaten Graph exportieren",
    "Exporter le graphe privé",
    "Exportar grafo privado",
  ],
  saved: [
    "Preferences saved.",
    "Präferenzen gespeichert.",
    "Préférences enregistrées.",
    "Preferencias guardadas.",
  ],
  erased: [
    "Memory erased.",
    "Gedächtnis gelöscht.",
    "Mémoire effacée.",
    "Memoria borrada.",
  ],
} as const;
export function usePreferenceText() {
  const { locale } = useLocale();
  const index =
    (
      { "en-GB": 0, "de-DE": 1, "fr-FR": 2, "es-ES": 3 } as Record<
        string,
        number
      >
    )[locale] ?? 0;
  return (key: keyof typeof words) => words[key][index];
}
