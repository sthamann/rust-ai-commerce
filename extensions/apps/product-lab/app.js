/** A complete guest surface can use any UI framework; this example needs no build or host imports. */
import { connectCommerce } from "../sdk.js";
const sdk = await connectCommerce();

const catalogue = {
  en: ["Product Lab", "Ask about care, materials and product facts. Advice records come from your shop’s app data.", "Product SKU", "Your question", "Ask Product Lab", "App-owned example facts · no model call", "Published advice", "Advice is temporarily unavailable. Please try again."],
  de: ["Produktlabor", "Frage nach Pflege, Materialien und Produktdaten. Beratungsdatensätze kommen aus den App-Daten deines Shops.", "Artikelnummer", "Deine Frage", "Produktlabor fragen", "App-eigene Beispielfakten · kein Modellaufruf", "Veröffentlichte Beratung", "Die Beratung ist vorübergehend nicht verfügbar. Bitte versuche es erneut."],
  fr: ["Laboratoire produit", "Posez des questions sur l’entretien, les matériaux et les caractéristiques. Les conseils proviennent de votre boutique.", "Référence produit", "Votre question", "Demander au laboratoire", "Exemples de l’app · aucun appel modèle", "Conseils publiés", "Les conseils sont temporairement indisponibles. Veuillez réessayer."],
  es: ["Laboratorio de productos", "Pregunta por cuidados, materiales y características. Los consejos proceden de los datos de tu tienda.", "Referencia", "Tu pregunta", "Preguntar al laboratorio", "Datos de ejemplo de la app · sin llamada al modelo", "Consejos publicados", "Los consejos no están disponibles temporalmente. Inténtalo de nuevo."],
};
const copy = index => sdk.uiText(Object.fromEntries(Object.entries(catalogue).map(([language, words]) => [language, words[index]])));
document.documentElement.lang = sdk.locale;
for (const [i, id] of ["title", "hint", "product-label", "question-label", "ask"].entries()) document.getElementById(id).textContent = copy(i);
if (sdk.context.productId) document.getElementById("product").value = sdk.context.productId;
document.getElementById("question-form").onsubmit = async event => {
  event.preventDefault();
  const button = document.getElementById("ask");
  button.disabled = true;
  document.getElementById("result").hidden = false;
  try {
    const result = await sdk.action("recommend", { productId: document.getElementById("product").value, question: document.getElementById("question").value, locale: sdk.contentLocale });
    document.getElementById("answer").textContent = result.answer;
    document.getElementById("source").textContent = copy(5);
  } catch { document.getElementById("answer").textContent = copy(7); }
  finally { button.disabled = false; }
};
let generation = 0;
let recordLanguage = sdk.contentLocale;
async function refreshRecords(context) {
  const current = ++generation;
  if (context.productId) document.getElementById("product").value = context.productId;
  document.getElementById("records").replaceChildren();
  document.getElementById("result").hidden = true;
  try {
    const page = await sdk.action("catalog", { limit: 5, filter: { product_id: document.getElementById("product").value } });
    if (current !== generation) return;
    for (const record of page.elements) {
      const article = document.createElement("article");
      article.textContent = sdk.text(record.title ?? {}) || copy(6);
      document.getElementById("records").append(article);
    }
  } catch { /* The question action remains available if managed advice is temporarily unavailable. */ }
}
sdk.onContext(context => {
  document.documentElement.lang = sdk.locale;
  for (const [i, id] of ["title", "hint", "product-label", "question-label", "ask"].entries()) document.getElementById(id).textContent = copy(i);
  if (recordLanguage !== sdk.contentLocale || (context.productId && context.productId !== document.getElementById("product").value)) void refreshRecords(context);
  recordLanguage = sdk.contentLocale;
});
void refreshRecords(sdk.context);
new ResizeObserver(() => sdk.resize(document.documentElement.scrollHeight)).observe(document.body);
