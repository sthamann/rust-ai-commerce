/** Typed four-language merchant AI policy vocabulary. */
export const guardrailWords = {
  guardrails: [
    "AI boundaries",
    "KI-Leitplanken",
    "Limites IA",
    "Límites de IA",
  ],
  guardrailBoundary: [
    "Explicit product corridors, current permissions and an original daily price baseline bound autonomous price changes. Minor units: 100 EUR cents = 1 EUR; 100 basis points = 1%. Margin excludes fees, shipping and returns.",
    "Explizite Produktkorridore, aktuelle Rechte und der ursprüngliche Tagespreis begrenzen autonome Preisänderungen. Kleine Währungseinheit: 100 EUR-Cent = 1 EUR; 100 Basispunkte = 1 %. Die Marge berücksichtigt keine Gebühren, Versandkosten oder Retouren.",
    "Les limites par produit, les droits actuels et le prix initial quotidien encadrent les changements autonomes. 100 centimes EUR = 1 EUR ; 100 points de base = 1 %. La marge exclut frais, livraison et retours.",
    "Los límites por producto, los permisos actuales y el precio inicial diario limitan los cambios autónomos. 100 céntimos EUR = 1 EUR; 100 puntos básicos = 1 %. El margen excluye comisiones, envío y devoluciones.",
  ],
  enableAutonomy: [
    "Allow bounded price autonomy",
    "Begrenzte Preisautonomie erlauben",
    "Autoriser les prix autonomes limités",
    "Permitir precios autónomos limitados",
  ],
  dailyProducts: [
    "Products per UTC day",
    "Produkte pro UTC-Tag",
    "Produits par jour UTC",
    "Productos por día UTC",
  ],
  changeBps: [
    "Maximum daily change (basis points, ≤500)",
    "Maximale Tagesänderung (Basispunkte, ≤500)",
    "Variation quotidienne maximale (points de base, ≤500)",
    "Cambio diario máximo (puntos básicos, ≤500)",
  ],
  addCorridor: [
    "Add product boundary",
    "Produktleitplanke hinzufügen",
    "Ajouter une limite produit",
    "Añadir límite de producto",
  ],
  minimumMinor: [
    "Minimum price (minor units)",
    "Mindestpreis (kleine Währungseinheiten)",
    "Prix minimum (unités mineures)",
    "Precio mínimo (unidades menores)",
  ],
  maximumMinor: [
    "Maximum price (minor units)",
    "Höchstpreis (kleine Währungseinheiten)",
    "Prix maximum (unités mineures)",
    "Precio máximo (unidades menores)",
  ],
  minimumMarginBps: [
    "Minimum margin (basis points)",
    "Mindestmarge (Basispunkte)",
    "Marge minimum (points de base)",
    "Margen mínimo (puntos básicos)",
  ],
  unitCostNetMinor: [
    "Net unit cost (minor units)",
    "Netto-Stückkosten (kleine Währungseinheiten)",
    "Coût unitaire net (unités mineures)",
    "Coste unitario neto (unidades menores)",
  ],
  maximumDiscountBps: [
    "Maximum discount (basis points; empty = unset)",
    "Maximaler Rabatt (Basispunkte; leer = ohne Grenze)",
    "Remise maximale (points de base ; vide = non définie)",
    "Descuento máximo (puntos básicos; vacío = sin definir)",
  ],
  priceLocked: [
    "Lock price for AI changes",
    "Preis für KI-Änderungen sperren",
    "Bloquer le prix pour l’IA",
    "Bloquear el precio para IA",
  ],
  requireAvailable: [
    "Require available stock",
    "Verfügbaren Bestand verlangen",
    "Exiger du stock disponible",
    "Exigir stock disponible",
  ],
  removeCorridor: [
    "Remove boundary from draft",
    "Leitplanke aus Entwurf entfernen",
    "Retirer la limite du brouillon",
    "Quitar el límite del borrador",
  ],
  saveGuardrails: [
    "Save boundaries",
    "Leitplanken speichern",
    "Enregistrer les limites",
    "Guardar límites",
  ],
  guardrailsSaved: [
    "Boundaries saved with a new configuration revision.",
    "Leitplanken mit neuer Konfigurationsversion gespeichert.",
    "Limites enregistrées avec une nouvelle révision.",
    "Límites guardados con una nueva revisión.",
  ],
} as const;
