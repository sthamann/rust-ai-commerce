/** Complete CRM/history vocabulary shared by settings, customer account and entity editors. */
import { useLocale } from "./i18n";
export const crmWords = {
  back: ["Back", "Zurück", "Retour", "Volver"],
  addressPending: [
    "Save or discard profile edits before changing addresses.",
    "Speichere oder verwerfe die Profiländerungen, bevor du Adressen änderst.",
    "Enregistrez ou annulez le profil avant de modifier les adresses.",
    "Guarda o descarta los cambios del perfil antes de cambiar direcciones.",
  ],
  customerRestore: [
    "Contact details, group, addresses and automation data can be restored. Account identity, login activity and the most recent purchase remain current.",
    "Kontaktdaten, Gruppe, Adressen und Automationsdaten lassen sich wiederherstellen. Kontoidentität, Anmeldeaktivität und der letzte Einkauf bleiben aktuell.",
    "Le contact, le groupe, les adresses et les données d’automatisation sont restaurables. L’identité, les connexions et le dernier achat restent actuels.",
    "Se pueden restaurar contacto, grupo, direcciones y datos de automatización. La identidad, los accesos y la última compra permanecen actuales.",
  ],
  history: [
    "Version history",
    "Versionshistorie",
    "Historique des versions",
    "Historial de versiones",
  ],
  historyHint: [
    "Changes are recorded from this update onwards. Earlier changes cannot be reconstructed.",
    "Änderungen werden ab diesem Update erfasst. Frühere Änderungen lassen sich nicht nachträglich rekonstruieren.",
    "Les modifications sont enregistrées à partir de cette mise à jour. Les changements antérieurs ne peuvent pas être reconstruits.",
    "Los cambios se registran desde esta actualización. No se pueden reconstruir los anteriores.",
  ],
  empty: [
    "No recorded changes yet",
    "Noch keine Änderungen erfasst",
    "Aucun changement enregistré",
    "Aún no hay cambios registrados",
  ],
  inspect: [
    "View changes",
    "Änderungen ansehen",
    "Voir les modifications",
    "Ver cambios",
  ],
  before: ["Before", "Vorher", "Avant", "Antes"],
  after: ["After", "Nachher", "Après", "Después"],
  field: ["Field", "Feld", "Champ", "Campo"],
  restoreBefore: [
    "Restore previous state",
    "Vorherigen Stand wiederherstellen",
    "Restaurer l’état précédent",
    "Restaurar estado anterior",
  ],
  restoreAfter: [
    "Restore this state",
    "Diesen Stand wiederherstellen",
    "Restaurer cet état",
    "Restaurar este estado",
  ],
  restore: [
    "Restore version",
    "Version wiederherstellen",
    "Restaurer la version",
    "Restaurar versión",
  ],
  restoreHint: [
    "This saves a new revision using current validation and permissions. Product inventory is preserved; knowledge sources require publication review again.",
    "Dies speichert eine neue Revision mit den aktuellen Prüfungen und Berechtigungen. Produktbestände bleiben erhalten; Wissensquellen müssen erneut zur Veröffentlichung geprüft werden.",
    "Une nouvelle révision sera validée avec les droits actuels. Les stocks sont conservés ; les sources doivent être réexaminées avant publication.",
    "Se guardará una nueva revisión con validación y permisos actuales. Se conservan las existencias; las fuentes requieren nueva revisión para publicarse.",
  ],
  dirty: [
    "Save or discard pending edits before restoring.",
    "Speichere oder verwerfe offene Änderungen vor der Wiederherstellung.",
    "Enregistrez ou annulez les modifications avant restauration.",
    "Guarda o descarta los cambios pendientes antes de restaurar.",
  ],
  readonly: [
    "Order history is read-only. Use workflow actions to change order, payment or delivery states.",
    "Bestellhistorie ist schreibgeschützt. Ändere Bestell-, Zahlungs- oder Lieferstatus über die Workflow-Aktionen.",
    "L’historique des commandes est en lecture seule. Utilisez les actions de workflow pour changer les états.",
    "El historial de pedidos es de solo lectura. Usa las acciones de flujo para cambiar estados.",
  ],
  system: [
    "System / unknown author",
    "System / Autor nicht bekannt",
    "Système / auteur inconnu",
    "Sistema / autor desconocido",
  ],
  merchant: [
    "Commerce Studio / API",
    "Commerce Studio / API",
    "Commerce Studio / API",
    "Commerce Studio / API",
  ],
  customer: [
    "Customer account",
    "Kundenkonto",
    "Compte client",
    "Cuenta de cliente",
  ],
  restored: [
    "Version restored as a new revision",
    "Version als neue Revision wiederhergestellt",
    "Version restaurée comme nouvelle révision",
    "Versión restaurada como nueva revisión",
  ],
  more: [
    "Load earlier changes",
    "Frühere Änderungen laden",
    "Charger les changements précédents",
    "Cargar cambios anteriores",
  ],
  loading: ["Loading…", "Wird geladen…", "Chargement…", "Cargando…"],
  useBilling: [
    "Use as default billing address",
    "Als Standard-Rechnungsadresse verwenden",
    "Utiliser pour la facturation par défaut",
    "Usar para facturación predeterminada",
  ],
  useShipping: [
    "Use as default delivery address",
    "Als Standard-Lieferadresse verwenden",
    "Utiliser pour la livraison par défaut",
    "Usar para entrega predeterminada",
  ],
  deleteAddress: [
    "Delete address?",
    "Adresse löschen?",
    "Supprimer l’adresse ?",
    "¿Eliminar dirección?",
  ],
  deleteAddressHint: [
    "Existing orders keep their address snapshot. If this is a default, another saved address becomes the default.",
    "Bestehende Bestellungen behalten ihre gespeicherte Adresse. Ist dies eine Standardadresse, wird eine andere gespeicherte Adresse zum Standard.",
    "Les commandes existantes conservent leur adresse. Une autre adresse enregistrée devient l’adresse par défaut si nécessaire.",
    "Los pedidos existentes conservan su dirección. Otra dirección guardada pasa a ser predeterminada si es necesario.",
  ],
  groups: [
    "Customer groups",
    "Kundengruppen",
    "Groupes clients",
    "Grupos de clientes",
  ],
  groupsHint: [
    "Manage groups, translations and gross/net pricing. Rules can target each group individually.",
    "Verwalte Gruppen, Übersetzungen und Brutto-/Nettopreise. Regeln können jede Gruppe einzeln berücksichtigen.",
    "Gérez groupes, traductions et prix TTC/HT. Les règles peuvent cibler chaque groupe.",
    "Gestiona grupos, traducciones y precios brutos/netos. Las reglas pueden dirigirse a cada grupo.",
  ],
  addGroup: [
    "Add customer group",
    "Kundengruppe hinzufügen",
    "Ajouter un groupe client",
    "Añadir grupo de clientes",
  ],
  newGroup: [
    "New customer group",
    "Neue Kundengruppe",
    "Nouveau groupe client",
    "Nuevo grupo de clientes",
  ],
  priceBasis: [
    "Pricing and checkout behavior",
    "Preis- und Checkout-Verhalten",
    "Comportement des prix et du paiement",
    "Comportamiento de precios y pago",
  ],
  consumer: [
    "Consumer · gross prices",
    "Privatkunde · Bruttopreise",
    "Particulier · prix TTC",
    "Consumidor · precios brutos",
  ],
  business: [
    "Business · net prices",
    "Geschäftskunde · Nettopreise",
    "Professionnel · prix HT",
    "Empresa · precios netos",
  ],
  baseGroup: [
    "Built-in groups remain available for guest checkout and account registration.",
    "Basisgruppen bleiben für Gastbestellungen und Registrierung erhalten.",
    "Les groupes de base restent disponibles pour les commandes invitées et les inscriptions.",
    "Los grupos base siguen disponibles para invitados y registros.",
  ],
  removeGroup: [
    "Delete customer group?",
    "Kundengruppe löschen?",
    "Supprimer le groupe client ?",
    "¿Eliminar grupo de clientes?",
  ],
  dependencyHint: [
    "Assigned customers and rule/price dependencies must be reassigned first. The server validates dependencies when saving.",
    "Zugeordnete Kunden und Regel-/Preisabhängigkeiten müssen zuerst umgestellt werden. Der Server prüft Abhängigkeiten beim Speichern.",
    "Réaffectez d’abord les clients et les dépendances de règles/prix. Le serveur vérifie les dépendances lors de l’enregistrement.",
    "Reasigna primero clientes y dependencias de reglas/precios. El servidor las comprueba al guardar.",
  ],
  delete: ["Delete", "Löschen", "Supprimer", "Eliminar"],
  name: ["Name", "Name", "Nom", "Nombre"],
  description: ["Description", "Beschreibung", "Description", "Descripción"],
  id: ["Reference", "Referenz", "Référence", "Referencia"],
  save: [
    "Save changes",
    "Änderungen speichern",
    "Enregistrer",
    "Guardar cambios",
  ],
  back: ["Back", "Zurück", "Retour", "Volver"],
  pending: [
    "Discard unsaved edits?",
    "Ungespeicherte Änderungen verwerfen?",
    "Annuler les modifications non enregistrées ?",
    "¿Descartar cambios sin guardar?",
  ],
  discard: [
    "Discard and continue",
    "Verwerfen und fortfahren",
    "Annuler et continuer",
    "Descartar y continuar",
  ],
} as const;
export type CrmWord = keyof typeof crmWords;
export function useCrmText() {
  const { locale } = useLocale();
  const index =
    ({ en: 0, de: 1, fr: 2, es: 3 } as Record<string, number>)[
      locale.split("-")[0]
    ] ?? 0;
  return { locale, r: (key: CrmWord) => crmWords[key][index] };
}
