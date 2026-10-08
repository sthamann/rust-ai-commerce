/** App operational vocabulary shared by installed apps and developer diagnostics; EN/DE/FR/ES. */
import { useLocale } from "./i18n";
const words = {
  download: [
    "Download result",
    "Ergebnis herunterladen",
    "Télécharger le résultat",
    "Descargar resultado",
  ],
  title: [
    "Activity & limits",
    "Aktivität & Limits",
    "Activité et limites",
    "Actividad y límites",
  ],
  refresh: ["Refresh", "Aktualisieren", "Actualiser", "Actualizar"],
  calls: [
    "Recent action calls",
    "Letzte Aktionsaufrufe",
    "Derniers appels",
    "Últimas llamadas",
  ],
  deliveries: [
    "Event delivery",
    "Ereigniszustellung",
    "Livraison des événements",
    "Entrega de eventos",
  ],
  rows: ["Records", "Datensätze", "Enregistrements", "Registros"],
  bytes: [
    "Stored bytes",
    "Gespeicherte Bytes",
    "Octets stockés",
    "Bytes almacenados",
  ],
  cursor: [
    "Replay after event ID",
    "Ab Ereignis-ID erneut zustellen",
    "Relivrer après l’ID",
    "Reenviar después del ID",
  ],
  replay: [
    "Replay events",
    "Ereignisse erneut zustellen",
    "Relivrer les événements",
    "Reenviar eventos",
  ],
  warning: [
    "Existing event IDs are preserved. Apps must deduplicate repeated deliveries. External effects may happen again. Up to 50 events are checked against current permissions.",
    "Die Ereignis-IDs bleiben erhalten. Apps müssen wiederholte Zustellungen erkennen. Externe Wirkungen können erneut auftreten. Bis zu 50 Ereignisse werden gegen die aktuellen Rechte geprüft.",
    "Les ID sont conservés. Les apps doivent dédupliquer les livraisons. Des effets externes peuvent se répéter. Jusqu’à 50 événements sont vérifiés selon les permissions actuelles.",
    "Se conservan los ID. Las apps deben deduplicar las entregas. Los efectos externos pueden repetirse. Se verifican hasta 50 eventos según los permisos actuales.",
  ],
  queued: ["Queued", "Eingeplant", "En file", "En cola"],
  running: ["Running", "Läuft", "En cours", "En curso"],
  delivered: ["Delivered", "Zugestellt", "Livré", "Entregado"],
  failed: ["Failed", "Fehlgeschlagen", "Échec", "Fallido"],
  empty: [
    "No activity yet",
    "Noch keine Aktivität",
    "Aucune activité",
    "Sin actividad",
  ],
  metadata: [
    "Metadata only: arguments, customer data and credentials are never logged here.",
    "Nur Metadaten: Argumente, Kundendaten und Zugangsdaten werden hier nicht protokolliert.",
    "Métadonnées uniquement : aucun argument, donnée client ou identifiant enregistré ici.",
    "Solo metadatos: aquí no se registran argumentos, datos de clientes ni credenciales.",
  ],
  jobs: ["Long actions", "Längere Aufträge", "Tâches longues", "Tareas largas"],
  jobHint: [
    "Durable progress from your app. Expired leases mean an uncertain external outcome; retries need review.",
    "Gespeicherter Fortschritt deiner App. Nach Ablauf einer Ausführungsfreigabe ist die externe Wirkung unklar; prüfe sie vor einem erneuten Versuch.",
    "Progression durable. Une autorisation expirée implique un résultat externe incertain ; vérifiez avant de réessayer.",
    "Progreso persistente. Una autorización vencida implica un resultado externo incierto; revísalo antes de reintentar.",
  ],
  jobUnknown: [
    "Confirm that you checked the external outcome. Retrying can repeat external effects.",
    "Bestätige, dass du die externe Wirkung geprüft hast. Wiederholen kann externe Aktionen erneut auslösen.",
    "Confirmez la vérification du résultat externe. Réessayer peut répéter des effets externes.",
    "Confirma que verificaste el resultado externo. Reintentar puede repetir efectos externos.",
  ],
  jobConfirm: [
    "Apply this transition? A running app must acknowledge cancellation; this does not kill its external process.",
    "Diese Änderung durchführen? Eine laufende App muss den Abbruch bestätigen; ihr externer Prozess wird dadurch nicht beendet.",
    "Appliquer ? L’app doit confirmer l’annulation ; son processus externe n’est pas arrêté.",
    "¿Aplicar? La app debe confirmar la cancelación; su proceso externo no se detiene.",
  ],
  succeeded: ["Completed", "Abgeschlossen", "Terminé", "Completado"],
  uncertain: [
    "Outcome needs review",
    "Ergebnis prüfen",
    "Résultat à vérifier",
    "Revisar resultado",
  ],
  cancel_requested: [
    "Cancellation requested",
    "Abbruch angefordert",
    "Annulation demandée",
    "Cancelación solicitada",
  ],
  cancelled: ["Cancelled", "Abgebrochen", "Annulé", "Cancelado"],
  cancel: ["Cancel", "Abbrechen", "Annuler", "Cancelar"],
  retry: [
    "Retry after review",
    "Nach Prüfung wiederholen",
    "Réessayer après vérification",
    "Reintentar tras revisión",
  ],
  archive: [
    "Remove completed job",
    "Abgeschlossenen Auftrag entfernen",
    "Supprimer la tâche terminée",
    "Eliminar tarea completada",
  ],
  resolve_cancelled: [
    "Confirm no further execution",
    "Keine weitere Ausführung bestätigen",
    "Confirmer sans reprise",
    "Confirmar sin reejecución",
  ],
  result: ["Result", "Ergebnis", "Résultat", "Resultado"],
  attempts: ["Attempts", "Versuche", "Tentatives", "Intentos"],
} as const;
export function useAppOperationsText() {
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
