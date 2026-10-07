/** Shared four-language interaction vocabulary for contextual Studio help and storefront discovery. */
import { useLocale } from "./i18n";
export const experienceUIWords = {
  copilot: [
    "Ask Vendune",
    "Frag Vendune",
    "Demander à Vendune",
    "Pregunta a Vendune",
  ],
  platformModel: [
    "Platform default",
    "Plattformvorgabe",
    "Modèle de la plateforme",
    "Modelo de la plataforma",
  ],
  context: [
    "Current context",
    "Aktueller Kontext",
    "Contexte actuel",
    "Contexto actual",
  ],
  copilotHint: [
    "Explore the current area without leaving your editor. Review every proposed change before applying it.",
    "Erkunde den aktuellen Bereich, ohne deinen Editor zu verlassen. Prüfe vorgeschlagene Änderungen, bevor du sie übernimmst.",
    "Explorez cet espace sans quitter votre éditeur. Vérifiez les modifications proposées avant de les appliquer.",
    "Explora este espacio sin salir del editor. Revisa los cambios propuestos antes de aplicarlos.",
  ],
  readTask: [
    "Explain what is happening",
    "Erkläre, was gerade passiert",
    "Expliquez ce qui se passe",
    "Explica qué está pasando",
  ],
  improveTask: [
    "Find opportunities",
    "Finde Verbesserungsmöglichkeiten",
    "Trouvez des améliorations",
    "Encuentra oportunidades",
  ],
  planTask: [
    "Prepare a change",
    "Bereite eine Änderung vor",
    "Préparez une modification",
    "Prepara un cambio",
  ],
  readPrompt: [
    "Explain this area using stored shop data. State what is known and what is missing. Do not make changes.",
    "Erkläre diesen Bereich anhand gespeicherter Shopdaten. Nenne belegte Fakten und fehlende Informationen. Verändere noch nichts.",
    "Expliquez cet espace à partir des données enregistrées. Distinguez les faits et les informations manquantes. Ne modifiez rien.",
    "Explica esta área con los datos guardados. Distingue hechos e información pendiente. No hagas cambios.",
  ],
  improvePrompt: [
    "Suggest improvements for this area, using stored evidence. Explain their likely benefit and uncertainty. Do not apply changes.",
    "Schlage Verbesserungen für diesen Bereich anhand gespeicherter Belege vor. Erkläre Nutzen und Unsicherheit. Übernimm noch keine Änderungen.",
    "Proposez des améliorations fondées sur les données enregistrées. Expliquez leur utilité et leur incertitude. N'appliquez rien.",
    "Propón mejoras con pruebas guardadas. Explica su utilidad e incertidumbre. No apliques cambios.",
  ],
  planPrompt: [
    "Help me prepare a reviewable change for this area. Ask which outcome I want before proposing specific changes.",
    "Hilf mir, eine prüfbare Änderung für diesen Bereich vorzubereiten. Frage zuerst nach meinem gewünschten Ergebnis.",
    "Aidez-moi à préparer une modification vérifiable. Demandez d'abord le résultat souhaité.",
    "Ayúdame a preparar un cambio revisable. Pregunta primero qué resultado quiero.",
  ],
  contextPrompt: [
    "Workspace: {workspace}. Area: {area}. {entity}\n\n{task}",
    "Arbeitsbereich: {workspace}. Bereich: {area}. {entity}\n\n{task}",
    "Espace : {workspace}. Section : {area}. {entity}\n\n{task}",
    "Espacio: {workspace}. Área: {area}. {entity}\n\n{task}",
  ],
  entity: [
    "Selected reference: {id}.",
    "Ausgewählte Referenz: {id}.",
    "Référence sélectionnée : {id}.",
    "Referencia seleccionada: {id}.",
  ],
  assistantIntro: [
    "A little inspiration. A better match.",
    "Etwas Inspiration. Ein besserer Treffer.",
    "Un peu d'inspiration. Le bon choix.",
    "Un poco de inspiración. Tu mejor opción.",
  ],
  assistantHint: [
    "Describe what matters to you. Explore recommendations from this shop’s catalogue.",
    "Beschreibe, was dir wichtig ist. Entdecke Empfehlungen aus dem Katalog dieses Shops.",
    "Décrivez ce qui compte pour vous. Explorez les recommandations du catalogue de cette boutique.",
    "Describe lo que te importa. Explora recomendaciones del catálogo de esta tienda.",
  ],
  budget: [
    "Find something within my budget",
    "Finde etwas in meinem Budget",
    "Trouvez selon mon budget",
    "Encuentra algo con mi presupuesto",
  ],
  gift: [
    "Help me choose a gift",
    "Hilf mir, ein Geschenk zu finden",
    "Aidez-moi à choisir un cadeau",
    "Ayúdame a elegir un regalo",
  ],
  compare: [
    "Help me compare products",
    "Hilf mir, Produkte zu vergleichen",
    "Aidez-moi à comparer",
    "Ayúdame a comparar productos",
  ],
  grounded: [
    "From this shop’s catalogue",
    "Aus dem Katalog dieses Shops",
    "Du catalogue de cette boutique",
    "Del catálogo de esta tienda",
  ],
  accountBenefits: [
    "Everything after your purchase",
    "Alles nach deinem Einkauf",
    "Tout après votre achat",
    "Todo después de tu compra",
  ],
  accountBenefitsHint: [
    "Orders, delivery updates, documents and saved addresses. Together in one place.",
    "Bestellungen, Lieferinformationen, Belege und gespeicherte Adressen. Zusammen an einem Ort.",
    "Commandes, livraison, documents et adresses. Réunis au même endroit.",
    "Pedidos, entregas, documentos y direcciones. Juntos en un lugar.",
  ],
} as const;
export type ExperienceUIKey = keyof typeof experienceUIWords;
export function useExperienceUIText() {
  const { locale } = useLocale();
  const index =
    ({ en: 0, de: 1, fr: 2, es: 3 } as const)[locale.slice(0, 2) as "en"] ?? 0;
  return {
    u: (key: ExperienceUIKey, values: Record<string, string> = {}) =>
      Object.entries(values).reduce(
        (text, [key, value]) => text.replaceAll(`{${key}}`, value),
        experienceUIWords[key][index] as string,
      ),
  };
}
