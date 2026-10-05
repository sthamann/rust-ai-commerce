/** Human/agent schema round-trip and dependency-cleanup regressions. */
import { expect, it } from "vitest";
import {
  binding,
  bump,
  compile,
  editHistory,
  newBlock,
  problems,
  removeEntity,
  renameEntity,
  template,
  textMap,
} from "../../src/admin/developer/app-model";
import example from "../../../extensions/apps/care-studio/manifest.json";
import type { Manifest } from "../../src/shared/apps/native/types";
it("compiles one manifest for visual edits, HTTP, MCP, native UI and flow actions", () => {
  const m = template(),
    v = m.views![0];
  expect(m.surfaces![0].actions).toEqual(["list_guides", "save_guides"]);
  expect(m.actions!.find((a) => a.handler === "save")!.flowAllowed).toBe(true);
  expect(newBlock("table", v, "guides").readAction).toBe("list_guides");
  expect(binding("text")).toEqual({
    entity: null,
    readAction: null,
    writeAction: null,
  });
  const roundtrip = compile(JSON.parse(JSON.stringify(m)));
  expect(roundtrip).toEqual(m);
  expect(problems(m)).toBe(false);
  expect(
    compile({
      ...m,
      actions: m.actions!.map((a) => ({ ...a, flowAllowed: false })),
    }).actions!.find((a) => a.handler === "save")!.flowAllowed,
  ).toBe(false);
});
it("preserves imported service extensions and cleans deleted model dependencies", () => {
  const m = compile(example as Manifest);
  expect(problems(m)).toBe(false);
  const cleaned = removeEntity(m, "guides");
  expect(cleaned.actions).toEqual([]);
  expect(cleaned.views![0].blocks).toEqual([]);
  expect(cleaned.apiRoutes).toEqual([]);
  expect(cleaned.intelligence!.entities).toEqual([]);
  const service = {
    ...m,
    runtime: "service",
    configuration: { own: "preserved" },
  };
  expect(compile(service)).toEqual(service);
});
it("rejects unsafe IDs, duplicate fields, public forms and private data on public views", () => {
  const m = template();
  expect(problems({ ...m, id: "x;drop" })).toBe(true);
  expect(
    problems({
      ...m,
      entities: [
        {
          ...m.entities[0],
          fields: [m.entities[0].fields[0], m.entities[0].fields[0]],
        },
      ],
    }),
  ).toBe(true);
  expect(
    problems({
      ...m,
      surfaces: m.surfaces!.map((s) => ({ ...s, location: "storefront.page" })),
    }),
  ).toBe(true);
  const read = {
    ...m,
    views: m.views!.map((v) => ({
      ...v,
      blocks: v.blocks.filter((b) => b.kind !== "form"),
    })),
    surfaces: m.surfaces!.map((s) => ({ ...s, location: "storefront.page" })),
  };
  expect(problems(read)).toBe(true);
  expect(
    problems({
      ...read,
      entities: read.entities.map((e) => ({ ...e, publicRead: true })),
    }),
  ).toBe(false);
});
it("undoes and redoes complete schema edits without fabricating translations", () => {
  const m = template(),
    start = { present: m, past: [], future: [] };
  const changed = editHistory(start, { ...m, name: { es: "Origen" } });
  expect(editHistory(changed, "undo").present).toEqual(m);
  expect(
    editHistory(editHistory(changed, "undo"), "redo").present.name,
  ).toEqual({ es: "Origen" });
  expect(editHistory(start, "undo")).toBe(start);
  expect(editHistory(start, "redo")).toBe(start);
  expect(textMap({ es: "Origen", de: null, fr: undefined, en: "" })).toEqual({
    es: "Origen",
    en: "",
  });
  expect(bump("1.2.9")).toBe("1.2.10");
  expect(bump("bad")).toBe("0.1.0");
});

it("renames a draft model across UI, API, AI tools and relationships", () => {
  const m = compile(example as Manifest);
  m.entities.push({
    name: "notes",
    label: { en: "Notes" },
    publicRead: false,
    fields: [
      {
        name: "guide",
        label: { en: "Guide" },
        kind: "string",
        references: "guides",
      },
    ],
  });
  const next = renameEntity(m, "guides", "care");
  expect(next.views![0].blocks[0].entity).toBe("care");
  expect(next.views![0].blocks[1].writeAction).toBe("save_care");
  expect(next.apiRoutes![0].action).toBe("list_care");
  expect(next.intelligence!.tools).toEqual(["list_care"]);
  expect(next.entities[1].fields[0].references).toBe("care");
});
