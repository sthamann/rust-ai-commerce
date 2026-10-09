# Care knowledge: graph-native app example

This package extends the native [Care Studio](../care-studio/manifest.json) model
with a mandatory product reference and an optional intelligence mapping. Install
through the usual package review/consent path or import it in **App Studio → Coding
agent** and edit the same manifest in **Connections → Knowledge graph mapping**.
Supply an existing product ID when saving a guide. Labels and content use the
shared content-language editor with main-language inheritance.

```json
"intelligence": {
  "description": {"en": "Care instructions"},
  "tools": ["list_guides"],
  "entities": ["guides"],
  "ontology": [{
    "entity": "guides",
    "nodeType": "care_advice",
    "label": {"en": "Care instructions"},
    "fields": ["product_id", "title", "instructions"],
    "relations": {"product_id": "applies_to"}
  }]
}
```

The shipped manifest includes English, German, French and Spanish labels. Other
content languages are supported without a package-specific translation form.

Use `GET /api/apps/ontology_care/entities/guides` or the native list action via
HTTP/MCP (`app.ontology_care.list_guides`). The existing response gains an
`ontology` view with tenant, nodes, selected properties, source record revision,
package version and edges such as `app.ontology_care.applies_to → product`.
The same view enters authorized merchant planner context. No app code or SQL runs
inside the graph renderer. The existing PostgreSQL native reference foreign key
owns product validity; pagination and equality filters remain unchanged.

Mappings cover up to four AI-enabled entities, 16 selected fields/entity, 24 records
and a 16 KiB graph response. Custom node/edge type identifiers are namespaced under
`app.<app-id>`. String native/app references and native multi-relation arrays produce
edges, without resolving or revealing the target object. IDs are scoped to the
returned tenant. Whole records omitted by the graph budget are counted separately;
ordinary list records retain their existing page. Declare a list action and
`data.read`; current action rights and RLS still apply.

**These are current app records, not confirmed public product claims.** A public
list action deliberately exposes its selected graph fields to shoppers; private
models require current merchant rights. Source admission for the product claim
compiler, global semantic traversal, and unstructured extraction from app content
remain separate work. Do not treat a graph mapping as fact confirmation.
