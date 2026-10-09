/** Native app graph mapping controls share the Studio vocabulary and four interface languages. */
export const appOntologyWords = {
  ontology: [
    "Knowledge graph mapping",
    "Wissensgraph-Zuordnung",
    "Correspondance du graphe de connaissances",
    "Mapeo del grafo de conocimiento",
  ],
  ontologyHint: [
    "Map enabled AI data models to your own graph types. Selected native fields and product/customer/order references are returned by the same authorized API and MCP tools. These records are not confirmed product claims.",
    "Ordne für die KI freigegebene Datenmodelle eigenen Graphtypen zu. Ausgewählte Felder und Produkt-, Kunden- oder Bestellverweise kommen über dieselben berechtigten API- und MCP-Werkzeuge. Diese Datensätze sind keine bestätigten Produktaussagen.",
    "Associez les modèles autorisés pour l’IA à vos types de graphe. Les champs et références natifs sont renvoyés par les mêmes outils API et MCP autorisés. Ces données ne sont pas des affirmations produit confirmées.",
    "Asigna modelos habilitados para IA a tus tipos de grafo. Los campos y referencias nativos se devuelven mediante las mismas herramientas API y MCP autorizadas. No son afirmaciones de producto confirmadas.",
  ],
  ontologyEnable: [
    "Use as a graph node",
    "Als Graphknoten verwenden",
    "Utiliser comme nœud du graphe",
    "Usar como nodo del grafo",
  ],
  ontologyType: [
    "Own node type",
    "Eigener Knotentyp",
    "Type de nœud personnalisé",
    "Tipo de nodo propio",
  ],
  ontologyRelation: [
    "Own relationship type (optional)",
    "Eigener Beziehungstyp (optional)",
    "Type de relation personnalisé (facultatif)",
    "Tipo de relación propio (opcional)",
  ],
  ontologyFields: [
    "Fields exposed in the graph",
    "Im Graphen sichtbare Felder",
    "Champs visibles dans le graphe",
    "Campos visibles en el grafo",
  ],
  ontologyLimit: [
    "Enable AI access and a native list action first. Up to four models can be mapped.",
    "Aktiviere zuerst den KI-Zugriff und eine native Leseaktion. Bis zu vier Modelle können zugeordnet werden.",
    "Activez d’abord l’accès IA et une action de lecture native. Quatre modèles au maximum.",
    "Activa primero el acceso de IA y una acción de lectura nativa. Se pueden mapear cuatro modelos.",
  ],
} as const;
