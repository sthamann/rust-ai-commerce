/** Checkout vocabulary: the same purchase and payment states in every supported UI language. */
import { useLocale } from "./i18n";
const text = {
  title: ["Checkout", "Zur Kasse", "Commander", "Finalizar compra"],
  subtitle: [
    "Your details, delivery and payment. All in one place.",
    "Deine Daten, Lieferung und Zahlung. Alles an einem Ort.",
    "Vos coordonnées, livraison et paiement. Tout au même endroit.",
    "Tus datos, entrega y pago. Todo en un lugar.",
  ],
  review: [
    "Review order",
    "Bestellung prüfen",
    "Vérifier la commande",
    "Revisar pedido",
  ],
  reviewed: [
    "Details confirmed. Review the total before placing your order.",
    "Daten bestätigt. Prüfe die Gesamtsumme vor der Bestellung.",
    "Coordonnées confirmées. Vérifiez le total avant de commander.",
    "Datos confirmados. Revisa el total antes de realizar el pedido.",
  ],
  changed: [
    "The price or available methods changed. Review your order again.",
    "Preis oder verfügbare Methoden haben sich geändert. Prüfe die Bestellung erneut.",
    "Le prix ou les options ont changé. Vérifiez à nouveau votre commande.",
    "El precio o las opciones cambiaron. Revisa tu pedido de nuevo.",
  ],
  summary: ["Your order", "Deine Bestellung", "Votre commande", "Tu pedido"],
  contact: [
    "Contact & address",
    "Kontakt & Adresse",
    "Contact et adresse",
    "Contacto y dirección",
  ],
  methods: [
    "Delivery & payment",
    "Lieferung & Zahlung",
    "Livraison et paiement",
    "Entrega y pago",
  ],
  quoteHint: [
    "Delivery and tax are confirmed when you review your details.",
    "Versand und Steuern werden beim Prüfen deiner Daten bestätigt.",
    "La livraison et les taxes sont confirmées lors de la vérification.",
    "El envío y los impuestos se confirman al revisar tus datos.",
  ],
  continuePay: [
    "Continue to PayPal",
    "Weiter zu PayPal",
    "Continuer vers PayPal",
    "Continuar a PayPal",
  ],
  checking: [
    "Confirming your payment…",
    "Deine Zahlung wird bestätigt …",
    "Confirmation de votre paiement…",
    "Confirmando tu pago…",
  ],
  paid: [
    "Payment confirmed",
    "Zahlung bestätigt",
    "Paiement confirmé",
    "Pago confirmado",
  ],
  paidHint: [
    "The provider receipt matches your order. You can close this page.",
    "Der Zahlungsbeleg stimmt mit deiner Bestellung überein. Du kannst diese Seite schließen.",
    "Le reçu correspond à votre commande. Vous pouvez fermer cette page.",
    "El comprobante coincide con tu pedido. Puedes cerrar esta página.",
  ],
  cancelled: [
    "Payment cancelled",
    "Zahlung abgebrochen",
    "Paiement annulé",
    "Pago cancelado",
  ],
  retry: [
    "Check payment again",
    "Zahlung erneut prüfen",
    "Vérifier à nouveau le paiement",
    "Comprobar el pago de nuevo",
  ],
  delayed: [
    "Confirmation is taking longer. Your order is saved; check again before starting another payment.",
    "Die Bestätigung dauert länger. Deine Bestellung ist gespeichert. Prüfe erneut, bevor du eine weitere Zahlung startest.",
    "La confirmation prend plus de temps. Votre commande est enregistrée ; vérifiez avant de recommencer un paiement.",
    "La confirmación está tardando. Tu pedido está guardado; comprueba antes de iniciar otro pago.",
  ],
  pending: [
    "Preparing your payment…",
    "Deine Zahlung wird vorbereitet …",
    "Préparation du paiement…",
    "Preparando tu pago…",
  ],
  test: [
    "Test payment · no real money",
    "Testzahlung · kein echtes Geld",
    "Paiement de test · aucun débit réel",
    "Pago de prueba · sin dinero real",
  ],
  live: [
    "PayPal payment",
    "PayPal-Zahlung",
    "Paiement PayPal",
    "Pago con PayPal",
  ],
  choose: [
    "Choose an available method",
    "Verfügbare Methode auswählen",
    "Choisir une option disponible",
    "Elige una opción disponible",
  ],
  unavailable: [
    "No available method for this address. Review your country or contact the shop.",
    "Keine verfügbare Methode für diese Adresse. Prüfe das Land oder kontaktiere den Shop.",
    "Aucune option pour cette adresse. Vérifiez le pays ou contactez la boutique.",
    "No hay opciones para esta dirección. Revisa el país o contacta con la tienda.",
  ],
  back: [
    "Back to the shop",
    "Zurück zum Shop",
    "Retour à la boutique",
    "Volver a la tienda",
  ],
} as const;
export function useCheckoutText() {
  const context = useLocale();
  const index =
    context.locale === "de-DE"
      ? 1
      : context.locale === "fr-FR"
        ? 2
        : context.locale === "es-ES"
          ? 3
          : 0;
  return { ...context, x: (key: keyof typeof text) => text[key][index] };
}
