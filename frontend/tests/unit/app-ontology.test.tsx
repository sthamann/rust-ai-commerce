/** One human/agent manifest with namespaced, selected graph fields and inherited labels. */
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect } from "vitest";
import AppOntology from "../../src/admin/developer/AppOntology";
import {
  template,
  compile,
  problems,
  renameEntity,
  removeEntity,
} from "../../src/admin/developer/app-model";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
import { ContentLanguage } from "../../src/shared/i18n/ContentLanguage";
import type { Manifest } from "../../src/shared/apps/native/types";
import example from "../../../extensions/apps/ontology-care/manifest.json";
it("keeps one manifest across graph mapping, model edits and the coding agent", () => {
  const m = compile(example as Manifest);
  expect(problems(m)).toBe(false);
  expect(compile(JSON.parse(JSON.stringify(m)))).toEqual(m);
  const renamed = renameEntity(m, "guides", "care");
  expect(renamed.intelligence?.ontology?.[0].entity).toBe("care");
  expect(renamed.intelligence?.ontology?.[0].nodeType).toBe("care_advice");
  expect(removeEntity(m, "guides").intelligence?.ontology).toEqual([]);
  const edited = compile({
    ...m,
    entities: m.entities.map((e) => ({
      ...e,
      fields: e.fields.filter((f) => f.name !== "product_id"),
    })),
  });
  expect(edited.intelligence?.ontology?.[0].fields).not.toContain("product_id");
  expect(edited.intelligence?.ontology?.[0].relations).toEqual({});
  const bad = structuredClone(m);
  bad.intelligence!.ontology![0].relations = { instructions: "claims" };
  expect(problems(bad)).toBe(true);
  bad.intelligence!.ontology![0].relations = {};
  bad.intelligence!.ontology![0].fields = ["secret"];
  expect(problems(bad)).toBe(true);
  bad.intelligence!.ontology![0].fields = ["title"];
  bad.intelligence!.ontology![0].nodeType = "product.property";
  expect(problems(bad)).toBe(true);
});
it("blocks mapping until a model is authorized for AI, then edits a single inherited-language field", () => {
  let current = template();
  current.entities[0].label = { "it-IT": "Istruzioni" };
  function Harness() {
    const [m, set] = useState(current);
    current = m;
    return (
      <>
        <button
          onClick={() =>
            set({
              ...m,
              intelligence: { ...m.intelligence!, entities: ["guides"] },
            })
          }
        >
          Fixture enable AI
        </button>
        <AppOntology manifest={m} onChange={set} />
      </>
    );
  }
  render(
    <LocaleProvider>
      <ContentLanguage mainLocale="it-IT" locales={["it-IT", "en-GB"]}>
        <Harness />
      </ContentLanguage>
    </LocaleProvider>,
  );
  expect(
    screen.getByRole("checkbox", { name: "Use as a graph node" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Fixture enable AI" }));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Use as a graph node" }),
  );
  expect(current.intelligence?.ontology?.[0].label).toEqual({
    "it-IT": "Istruzioni",
  });
  expect(screen.getByPlaceholderText("Istruzioni")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Own node type"), {
    target: { value: "care_advice" },
  });
  expect(current.intelligence?.ontology?.[0].nodeType).toBe("care_advice");
  fireEvent.click(screen.getByRole("checkbox", { name: "title" }));
  expect(current.intelligence?.ontology?.[0].fields).toEqual(["instructions"]);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Use as a graph node" }),
  );
  expect(current.intelligence?.ontology).toEqual([]);
});
