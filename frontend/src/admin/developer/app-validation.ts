/** Draft validation surfaces bounded manifest errors; authoritative installation remains in Rust. */
import type { Manifest } from "../../shared/apps/native/types";
import { isDataBlock } from "../../shared/apps/native/types";
export function problems(m: Manifest) {
  const ids = [
    m.id,
    ...m.entities.map((e) => e.name),
    ...m.entities.flatMap((e) => e.fields.map((f) => f.name)),
    ...(m.views ?? []).map((v) => v.id),
  ];
  return (
    (m.paymentProvider !== undefined &&
      (m.runtime !== "service" ||
        m.category !== "payment" ||
        !m.permissions.includes("payments.provider") ||
        m.paymentProvider.apiVersion !== "1" ||
        m.paymentProvider.methods.length === 0 ||
        m.paymentProvider.methods.length > 32 ||
        new Set(m.paymentProvider.methods.map((v) => v.id)).size !==
          m.paymentProvider.methods.length ||
        m.paymentProvider.methods.some(
          (v) =>
            !/^[a-z][a-z0-9_]{0,31}$/.test(v.id) ||
            !v.currencies.length ||
            v.currencies.some((c) => !/^[A-Z]{3}$/.test(c)) ||
            !v.capabilities.includes(v.intent),
        ))) ||
    ontologyProblems(m) ||
    ids.some((id) => !/^[a-z][a-z0-9_]{0,31}$/.test(id)) ||
    !/^\d+\.\d+\.\d+$/.test(m.version) ||
    m.entities.length > 12 ||
    m.entities.some(
      (e) =>
        e.fields.length === 0 ||
        e.fields.length > 16 ||
        new Set(e.fields.map((f) => f.name)).size !== e.fields.length ||
        e.fields.some((f) => ["tenant", "id", "revision"].includes(f.name)),
    ) ||
    new Set(m.entities.map((e) => e.name)).size !== m.entities.length ||
    (m.views ?? []).some(
      (v) =>
        v.blocks.length > 32 ||
        v.blocks.some(
          (b) =>
            isDataBlock(b.kind) && !m.entities.some((e) => e.name === b.entity),
        ),
    ) ||
    (m.surfaces ?? []).some(
      (s) =>
        !s.location.startsWith("admin.") &&
        m.views
          ?.find((v) => s.uiPath === `native/${v.id}`)
          ?.blocks.some(
            (b) =>
              b.kind === "form" ||
              (isDataBlock(b.kind) &&
                !m.entities.find((e) => e.name === b.entity)?.publicRead),
          ),
    )
  );
}

/** Draft feedback mirrors native ontology bounds; it grants no runtime permission. */
function ontologyProblems(m: Manifest) {
  const nodes = m.intelligence?.ontology ?? [];
  return (
    nodes.length > 4 ||
    new Set(nodes.map((n) => n.entity)).size !== nodes.length ||
    nodes.some((n) => {
      const e = m.entities.find((e) => e.name === n.entity);
      return (
        !e ||
        !/^[a-z][a-z0-9_]{0,31}$/.test(n.nodeType) ||
        !m.intelligence?.entities.includes(n.entity) ||
        !m.permissions.includes("data.read") ||
        !m.actions?.some(
          (a) => a.handler === "list" && a.entity === n.entity,
        ) ||
        !Object.keys(n.label).length ||
        Object.keys(n.label).length > 100 ||
        Object.values(n.label).some(
          (v) => !v.trim() || new TextEncoder().encode(v).length > 120,
        ) ||
        !n.fields.length ||
        n.fields.length > 16 ||
        new Set(n.fields).size !== n.fields.length ||
        n.fields.some((f) => !e.fields.some((field) => field.name === f)) ||
        Object.entries(n.relations ?? {}).some(
          ([f, kind]) =>
            !/^[a-z][a-z0-9_]{0,31}$/.test(kind) ||
            !n.fields.includes(f) ||
            !e.fields.some(
              (field) =>
                field.name === f && (field.coreReference || field.references),
            ),
        )
      );
    })
  );
}
