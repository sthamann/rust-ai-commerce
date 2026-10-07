/** Four-language automation editor vocabulary keeps source identifiers stable and user labels readable. */
import { useLocale } from "./i18n";
import { sourceLabels } from "./automation-labels";
import { fieldLabels } from "./automation-fields";
const words: Record<string, readonly string[]> = {
  headless: [
    "Headless API",
    "API ohne Shop-Oberfläche",
    "API sans vitrine",
    "API sin tienda visual",
  ],
  pipeline: [
    "Flow canvas",
    "Flow-Arbeitsfläche",
    "Canevas du flux",
    "Lienzo del flujo",
  ],
  addAction: [
    "Add action",
    "Aktion hinzufügen",
    "Ajouter une action",
    "Añadir acción",
  ],
  addCondition: [
    "Add branch",
    "Verzweigung hinzufügen",
    "Ajouter une branche",
    "Añadir rama",
  ],
  addDelay: [
    "Add delay",
    "Verzögerung hinzufügen",
    "Ajouter un délai",
    "Añadir demora",
  ],
  stop: ["Stop flow", "Flow stoppen", "Arrêter le flux", "Detener el flujo"],
  yes: ["Yes", "Ja", "Oui", "Sí"],
  no: ["No", "Nein", "Non", "No"],
  seconds: ["Seconds", "Sekunden", "Secondes", "Segundos"],
  entry: ["Start here", "Hier starten", "Commencer ici", "Empezar aquí"],
  end: ["End", "Ende", "Fin", "Fin"],
  next: ["Next step", "Nächster Schritt", "Étape suivante", "Paso siguiente"],
  original: [
    "Shopware conditions",
    "Shopware-Bedingungen",
    "Conditions Shopware",
    "Condiciones Shopware",
  ],
  missing: [
    "Runtime missing",
    "Ausführung noch nicht verfügbar",
    "Exécution indisponible",
    "Ejecución no disponible",
  ],
  tags: ["Tags", "Tags", "Étiquettes", "Etiquetas"],
  field: ["Field", "Feld", "Champ", "Campo"],
  value: ["Value", "Wert", "Valeur", "Valor"],
  instruction: [
    "Message / instruction",
    "Nachricht / Anweisung",
    "Message / instruction",
    "Mensaje / instrucción",
  ],
  action: ["Action", "Aktion", "Action", "Acción"],
  app: ["App", "App", "Application", "Aplicación"],
  nodes: ["Steps", "Schritte", "Étapes", "Pasos"],
  condition: ["Condition", "Bedingung", "Condition", "Condición"],
  delay: ["Delay", "Verzögerung", "Délai", "Espera"],
  removeStep: [
    "Remove step",
    "Schritt entfernen",
    "Supprimer l’étape",
    "Eliminar paso",
  ],
  source: [
    "Source contract",
    "Original-Vertrag",
    "Contrat source",
    "Contrato original",
  ],
  ruleReference: [
    "Saved rule",
    "Gespeicherte Regel",
    "Règle enregistrée",
    "Regla guardada",
  ],
  filter: [
    "Filter line items",
    "Positionen filtern",
    "Filtrer les articles",
    "Filtrar artículos",
  ],
  operator: ["Comparison", "Vergleich", "Comparaison", "Comparación"],
  type: ["Type", "Typ", "Type", "Tipo"],
  text: ["Text", "Text", "Texte", "Texto"],
  int: ["Integer", "Ganze Zahl", "Entier", "Entero"],
  float: ["Number", "Zahl", "Nombre", "Número"],
  bool: ["Yes / no", "Ja / nein", "Oui / non", "Sí / no"],
  date: ["Date", "Datum", "Date", "Fecha"],
  datetime: [
    "Date and time",
    "Datum und Uhrzeit",
    "Date et heure",
    "Fecha y hora",
  ],
  select: ["Selection", "Auswahl", "Sélection", "Selección"],
  from: ["From", "Von", "De", "Desde"],
  to: ["To", "Bis", "À", "Hasta"],
  products: ["Products", "Produkte", "Produits", "Productos"],
  customer: ["Customer", "Kunde", "Client", "Cliente"],
  cart: ["Cart", "Warenkorb", "Panier", "Carrito"],
  order: ["Order", "Bestellung", "Commande", "Pedido"],
  metadata: [
    "Rule data",
    "Regeldaten",
    "Données des règles",
    "Datos de reglas",
  ],
  note: ["Internal note", "Interne Notiz", "Note interne", "Nota interna"],
  ai_proposal: [
    "AI proposal for review",
    "KI-Vorschlag zur Prüfung",
    "Proposition IA à examiner",
    "Propuesta de IA para revisión",
  ],
  app_action: [
    "Installed app action",
    "Aktion einer installierten App",
    "Action d’une application installée",
    "Acción de aplicación instalada",
  ],
};
const actions: Record<string, readonly string[]> = {
  "action.add.customer.tag": [
    "Tag customer",
    "Kunden markieren",
    "Étiqueter le client",
    "Etiquetar cliente",
  ],
  "action.remove.customer.tag": [
    "Remove customer tags",
    "Kundentags entfernen",
    "Retirer les étiquettes du client",
    "Quitar etiquetas de cliente",
  ],
  "action.add.order.tag": [
    "Tag order",
    "Bestellung markieren",
    "Étiqueter la commande",
    "Etiquetar pedido",
  ],
  "action.remove.order.tag": [
    "Remove order tags",
    "Bestelltags entfernen",
    "Retirer les étiquettes de commande",
    "Quitar etiquetas de pedido",
  ],
  "action.change.customer.group": [
    "Change customer group",
    "Kundengruppe ändern",
    "Changer le groupe client",
    "Cambiar grupo de cliente",
  ],
  "action.change.customer.status": [
    "Activate / deactivate customer",
    "Kunden aktivieren / deaktivieren",
    "Activer / désactiver le client",
    "Activar / desactivar cliente",
  ],
  "action.set.order.state": [
    "Change order / payment / delivery state",
    "Bestell-, Zahlungs- oder Lieferstatus ändern",
    "Changer le statut de commande, paiement ou livraison",
    "Cambiar estado de pedido, pago o entrega",
  ],
  "action.generate.document": [
    "Generate document",
    "Beleg erstellen",
    "Générer un document",
    "Generar documento",
  ],
  "action.grant.download.access": [
    "Grant / revoke download access",
    "Downloadzugriff erteilen / entziehen",
    "Autoriser / révoquer le téléchargement",
    "Conceder / revocar acceso a descarga",
  ],
  "action.mail.send": [
    "Send email",
    "E-Mail versenden",
    "Envoyer un e-mail",
    "Enviar correo",
  ],
  "action.stop.flow": [
    "Stop flow",
    "Flow stoppen",
    "Arrêter le flux",
    "Detener el flujo",
  ],
  "action.set.customer.custom.field": [
    "Set customer custom field",
    "Kunden-Zusatzfeld setzen",
    "Définir un champ client",
    "Establecer campo de cliente",
  ],
  "action.set.order.custom.field": [
    "Set order custom field",
    "Bestell-Zusatzfeld setzen",
    "Définir un champ de commande",
    "Establecer campo de pedido",
  ],
  "action.set.customer.group.custom.field": [
    "Set customer group custom field",
    "Kundengruppen-Zusatzfeld setzen",
    "Définir un champ de groupe client",
    "Establecer campo de grupo",
  ],
  "action.add.customer.affiliate.and.campaign.code": [
    "Customer attribution codes",
    "Partner- und Kampagnencode am Kunden",
    "Codes d’attribution du client",
    "Códigos de atribución de cliente",
  ],
  "action.add.order.affiliate.and.campaign.code": [
    "Order attribution codes",
    "Partner- und Kampagnencode an der Bestellung",
    "Codes d’attribution de commande",
    "Códigos de atribución de pedido",
  ],
};
export function useAutomationText() {
  const { locale } = useLocale();
  const index = ["en", "de", "fr", "es"].indexOf(locale.slice(0, 2));
  return {
    a: (key: string) =>
      (words[key] ?? actions[key] ?? sourceLabels[key] ?? fieldLabels[key])?.[
        index
      ] ?? key,
    locale,
  };
}
