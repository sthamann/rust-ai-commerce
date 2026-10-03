/** Localized request guidance across all transports; original diagnostics remain available to developer tools. */
import { getLocale } from "./i18n";
const messages: Record<string, readonly string[]> = {
  "Invalid credentials": [
    "Email or password is incorrect.",
    "E-Mail oder Passwort ist falsch.",
    "Adresse e-mail ou mot de passe incorrect.",
    "El correo o la contraseña son incorrectos.",
  ],
  "Insufficient stock": [
    "This quantity is no longer available. Choose another quantity or variant.",
    "Diese Menge ist nicht mehr verfügbar. Wähle eine andere Menge oder Variante.",
    "Cette quantité n’est plus disponible. Choisissez une autre quantité ou variante.",
    "Esta cantidad ya no está disponible. Elige otra cantidad o variante.",
  ],
  "Cart revision changed; reload before editing": [
    "The cart has changed. Refresh it before continuing.",
    "Der Warenkorb hat sich geändert. Lade ihn vor dem Fortfahren neu.",
    "Le panier a changé. Actualisez-le avant de continuer.",
    "El carrito ha cambiado. Actualízalo antes de continuar.",
  ],
  "Live content changed; resolve before release": [
    "The live shop has changed. Resolve the conflict before publishing.",
    "Der Live-Shop hat sich geändert. Löse den Konflikt vor der Veröffentlichung.",
    "La boutique en ligne a changé. Résolvez le conflit avant publication.",
    "La tienda publicada ha cambiado. Resuelve el conflicto antes de publicar.",
  ],
};
const fallback: Record<string, readonly string[]> = {
  401: [
    "Please sign in again.",
    "Bitte melde dich erneut an.",
    "Veuillez vous reconnecter.",
    "Vuelve a iniciar sesión.",
  ],
  403: [
    "Your account cannot perform this action in this shop.",
    "Dein Konto darf diese Aktion in diesem Shop nicht ausführen.",
    "Votre compte ne peut pas effectuer cette action dans cette boutique.",
    "Tu cuenta no puede realizar esta acción en esta tienda.",
  ],
  404: [
    "This item is unavailable in the selected shop or sales channel.",
    "Dieser Eintrag ist im ausgewählten Shop oder Verkaufskanal nicht verfügbar.",
    "Cet élément n’est pas disponible dans cette boutique ou ce canal.",
    "Este elemento no está disponible en la tienda o canal seleccionado.",
  ],
  409: [
    "The data has changed. Refresh and review before trying again.",
    "Die Daten haben sich geändert. Lade sie neu und prüfe sie vor einem neuen Versuch.",
    "Les données ont changé. Actualisez et vérifiez avant de réessayer.",
    "Los datos han cambiado. Actualiza y revisa antes de volver a intentarlo.",
  ],
  429: [
    "The service is busy. Try again shortly.",
    "Der Dienst ist ausgelastet. Versuche es gleich noch einmal.",
    "Le service est occupé. Réessayez dans un instant.",
    "El servicio está ocupado. Inténtalo de nuevo en un momento.",
  ],
  400: [
    "Check the required fields, translations and selected settings.",
    "Prüfe die Pflichtfelder, Übersetzungen und ausgewählten Einstellungen.",
    "Vérifiez les champs requis, les traductions et les paramètres sélectionnés.",
    "Revisa los campos obligatorios, traducciones y ajustes seleccionados.",
  ],
  500: [
    "The service could not complete the request. Try again or check its configuration.",
    "Der Dienst konnte die Anfrage nicht abschließen. Versuche es erneut oder prüfe seine Konfiguration.",
    "Le service n’a pas pu traiter la demande. Réessayez ou vérifiez sa configuration.",
    "El servicio no pudo completar la solicitud. Inténtalo de nuevo o revisa su configuración.",
  ],
};
export function responseError(detail: string, status: number): Error {
  const i = { "en-GB": 0, "de-DE": 1, "fr-FR": 2, "es-ES": 3 }[getLocale()];
  const error = new Error(
    (messages[detail] ?? fallback[String(status)] ?? fallback[500])[i],
  );
  Object.assign(error, { diagnostic: detail, status });
  return error;
}
