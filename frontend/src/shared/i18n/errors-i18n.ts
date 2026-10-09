/** Localized request guidance across all transports; original diagnostics remain available to developer tools. */
import { getLocale } from "./i18n";
const messages: Record<string, readonly string[]> = {
  "Private advice context changed during inference; ask again": [
    "Your private preferences or permission changed while the answer was being prepared. Please ask again.",
    "Deine privaten Präferenzen oder deine Freigabe wurden während der Antwort geändert. Bitte frage erneut.",
    "Vos préférences privées ou votre autorisation ont changé pendant la réponse. Veuillez réessayer.",
    "Tus preferencias privadas o tu permiso cambiaron durante la respuesta. Vuelve a preguntar.",
  ],
  "Invalid app ontology mapping": [
    "Check the graph mapping: select an enabled AI model, a native list action, a valid type and existing fields.",
    "Prüfe die Graph-Zuordnung: Wähle ein für KI freigegebenes Modell, eine native Leseaktion, einen gültigen Typ und vorhandene Felder.",
    "Vérifiez le graphe : modèle autorisé pour l’IA, action de lecture native, type valide et champs existants.",
    "Revisa el grafo: modelo habilitado para IA, acción de lectura nativa, tipo válido y campos existentes.",
  ],
  "Account already exists": [
    "An account with this email already exists. Sign in instead.",
    "Für diese E-Mail besteht bereits ein Konto. Bitte melde dich an.",
    "Un compte existe déjà avec cette adresse e-mail. Connectez-vous.",
    "Ya existe una cuenta con este correo. Inicia sesión.",
  ],
  "Checkout changed; review your order again": [
    "The price or checkout changed. Review your order again before placing it.",
    "Preis oder Checkout haben sich geändert. Prüfe die Bestellung vor dem Abschluss erneut.",
    "Le prix ou la commande a changé. Vérifiez avant de commander.",
    "El precio o el pedido cambió. Revisa antes de realizar el pedido.",
  ],
  "Database capacity busy; retry later": [
    "The shop is busy. Please try again shortly.",
    "Der Shop ist gerade ausgelastet. Bitte versuche es gleich erneut.",
    "La boutique est occupée. Veuillez réessayer dans un instant.",
    "La tienda está ocupada. Inténtalo de nuevo en un momento.",
  ],
  "Customer group is assigned to customers": [
    "Assign the customers to another group before removing this group.",
    "Ordne die Kunden einer anderen Gruppe zu, bevor du diese Gruppe entfernst.",
    "Réaffectez les clients avant de supprimer ce groupe.",
    "Asigna los clientes a otro grupo antes de eliminar este grupo.",
  ],
  "Customer group is assigned to advanced prices": [
    "Update the product quantity prices before removing this group.",
    "Passe die Produkt-Staffelpreise an, bevor du diese Gruppe entfernst.",
    "Modifiez les prix dégressifs avant de supprimer ce groupe.",
    "Actualiza los precios por cantidad antes de eliminar este grupo.",
  ],
  "Customer group is used by a rule or flow": [
    "Update the rules or flows referencing this group before removing it.",
    "Passe die Regeln oder Flows an, die diese Gruppe verwenden, bevor du sie entfernst.",
    "Modifiez les règles ou flux utilisant ce groupe avant sa suppression.",
    "Actualiza las reglas o flujos que usan este grupo antes de eliminarlo.",
  ],
  "Unknown customer group": [
    "Choose a configured customer group.",
    "Wähle eine eingerichtete Kundengruppe.",
    "Choisissez un groupe client configuré.",
    "Elige un grupo de clientes configurado.",
  ],
  "Product number already exists": [
    "This product number is already used in this shop. Choose another number.",
    "Diese Produktnummer wird im Shop bereits verwendet. Wähle eine andere Nummer.",
    "Ce numéro de produit est déjà utilisé. Choisissez un autre numéro.",
    "Este número de producto ya está en uso. Elige otro número.",
  ],
  "Product sources changed; ask again": [
    "The product or its sources changed while answering. Please ask again for current information.",
    "Das Produkt oder seine Quellen wurden während der Antwort geändert. Frage erneut nach den aktuellen Angaben.",
    "Le produit ou ses sources ont changé pendant la réponse. Posez à nouveau votre question.",
    "El producto o sus fuentes cambiaron durante la respuesta. Vuelve a preguntar para obtener datos actuales.",
  ],
  "Product changed": [
    "Another change was saved. Keep your draft and reload the product before merging it.",
    "Eine andere Änderung wurde gespeichert. Bewahre deinen Entwurf und lade das Produkt vor dem Zusammenführen neu.",
    "Une autre modification a été enregistrée. Conservez votre brouillon et rechargez le produit.",
    "Se guardó otro cambio. Conserva tu borrador y vuelve a cargar el producto.",
  ],
  "Category parent is unavailable or creates a cycle": [
    "Choose an existing parent outside this category's own branch.",
    "Wähle eine bestehende übergeordnete Kategorie außerhalb dieses eigenen Zweigs.",
    "Choisissez un parent existant hors de la branche de cette catégorie.",
    "Elige una categoría superior existente fuera de esta misma rama.",
  ],
  "Category changed": [
    "The category changed. Reload it before saving your changes.",
    "Die Kategorie wurde geändert. Lade sie vor dem Speichern neu.",
    "La catégorie a changé. Rechargez-la avant d'enregistrer.",
    "La categoría cambió. Vuelve a cargarla antes de guardar.",
  ],
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
