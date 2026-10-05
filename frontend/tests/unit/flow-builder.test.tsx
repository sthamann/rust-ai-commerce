/** Real graph editing, source condition round-trips and JSON typing regression tests; no providers. */
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FlowExecution from "../../src/admin/automation/FlowExecution";
import RuleBuilder from "../../src/admin/automation/RuleBuilder";
import FlowBuilder from "../../src/admin/automation/FlowBuilder";
import { knowledgeWords } from "../../src/shared/i18n/knowledge-i18n";
import FlowCanvas from "../../src/admin/automation/FlowCanvas";
import JsonField from "../../src/admin/automation/JsonField";
import {
  appendNode,
  removeNode,
  type Pipeline,
} from "../../src/admin/automation/pipeline-types";
import {
  sourceRule,
  fromSource,
  toSource,
} from "../../src/admin/automation/source-rules";
import { LocaleProvider } from "../../src/shared/i18n/i18n";
const catalog = {
  conditions: ["alwaysValid"],
  events: ["order.placed"],
  fields: [],
  apps: [],
  actions: ["note", "action.add.order.tag"],
};
const initial: Pipeline = {
  entry: "first",
  nodes: [
    {
      id: "first",
      kind: "condition",
      condition: { type: "alwaysValid" },
      on_true: null,
      on_false: null,
    },
  ],
};
it("appending after a condition connects its true branch and removing nodes clears dangling edges", () => {
  const p = appendNode(initial, "action");
  expect(p.nodes[0]).toMatchObject({ on_true: p.nodes[1].id });
  const q = removeNode(p, p.nodes[1].id);
  expect(q.nodes[0]).toMatchObject({ on_true: null });
  expect(removeNode(p, "first").entry).toBe(p.nodes[1].id);
});
it("source nodes preserve nested source configurations through editor round trips", () => {
  const node = {
    type: "xorContainer",
    config: {
      children: [
        {
          type: "cartLineItemInCategory",
          config: { operator: "!=", categoryIds: ["home"] },
        },
      ],
    },
  };
  expect(toSource(fromSource(node))).toEqual(node);
  const def = {
    type: "xorContainer",
    supported: true,
    status: "native-scope",
    source: "Framework/Rule",
    config: null,
  };
  expect(sourceRule(def)).toMatchObject({
    name: "xorContainer",
    config: { children: [{ type: "alwaysValid", config: {} }] },
  });
});
it("invalid JSON stays editable and invalidates the saved payload", () => {
  const changed = vi.fn();
  render(
    <JsonField
      label="Arguments"
      value={{ a: 1 }}
      onChange={changed}
      objectOnly
    />,
  );
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: '{"a":' } });
  expect(input).toHaveValue('{"a":');
  expect(changed).toHaveBeenLastCalledWith(null);
  expect(input).toBeInvalid();
  fireEvent.change(input, { target: { value: '{"a":2}' } });
  expect(changed).toHaveBeenLastCalledWith({ a: 2 });
  expect(input).toBeValid();
});
describe.each([
  ["en-GB", "Add action", "Yes"],
  ["de-DE", "Aktion hinzufügen", "Ja"],
  ["fr-FR", "Ajouter une action", "Oui"],
  ["es-ES", "Añadir acción", "Sí"],
])("connected canvas in %s", (locale, add, yes) => {
  it("edits the actual persisted branch graph with localized controls", () => {
    localStorage.setItem("rac-locale", locale);
    let output = initial;
    function Editor() {
      const [p, set] = useState(initial);
      return (
        <FlowCanvas
          value={p}
          catalog={catalog}
          onChange={(v) => {
            output = v;
            set(v);
          }}
        />
      );
    }
    const view = render(<Editor />, { wrapper: LocaleProvider });
    fireEvent.click(screen.getByRole("button", { name: `+ ${add}` }));
    expect(output.nodes).toHaveLength(2);
    expect(output.nodes[0]).toMatchObject({ on_true: output.nodes[1].id });
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(
      view.container.querySelector("path[marker-end]"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(`✓ ${yes}`)).toHaveValue(output.nodes[1].id);
  });
});

it("shows the frozen branch trace and scheduled continuation from persisted jobs", () => {
  localStorage.setItem("rac-locale", "en-GB");
  render(
    <FlowExecution
      job={{
        state: "queued",
        cursor: "after-delay",
        availableAt: "2026-10-03T14:00:00Z",
        execution: {
          trace: [
            { node: "check", matched: false },
            { node: "tag", action: "action.add.order.tag" },
          ],
        },
      }}
    />,
    { wrapper: LocaleProvider },
  );
  expect(screen.getByText(/after-delay/)).toBeInTheDocument();
  expect(screen.getByText(/2 Steps/)).toBeInTheDocument();
  expect(screen.getByText(/No/)).toBeInTheDocument();
  expect(screen.getByText(/Tag order/)).toBeInTheDocument();
});

describe.each(["en-GB", "de-DE", "fr-FR", "es-ES"])(
  "stable source selection in %s",
  (locale) => {
    it("keeps the source identifier separate from its translated label", () => {
      localStorage.setItem("rac-locale", locale);
      const changed = vi.fn();
      const definitions = ["cartCartAmount", "cartGoodsCount"].map((type) => ({
        type,
        supported: true,
        status: "native-scope",
        source: "Checkout/Cart/Rule",
        config: {
          operatorSet: { operators: ["=", ">="] },
          fields: { amount: { name: "amount", type: "float", config: {} } },
        },
      }));
      render(
        <RuleBuilder
          value={{
            type: "shopwareCondition",
            name: "cartCartAmount",
            config: { operator: ">=", amount: 100 },
          }}
          onChange={changed}
          catalog={{ ...catalog, sourceConditions: definitions }}
        />,
        { wrapper: LocaleProvider },
      );
      const selection = screen.getAllByRole("combobox")[0];
      expect(selection).toHaveValue("source:cartCartAmount");
      fireEvent.change(selection, {
        target: { value: "source:cartGoodsCount" },
      });
      expect(changed).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: "shopwareCondition",
          name: "cartGoodsCount",
        }),
      );
    });
  },
);

it.each(["en-GB", "de-DE", "fr-FR", "es-ES"])(
  "knowledge lifecycle trigger is selectable with a translated label in %s",
  (locale) => {
    localStorage.setItem("rac-locale", locale);
    const changed = vi.fn();
    const index = ["en-GB", "de-DE", "fr-FR", "es-ES"].indexOf(locale);
    render(
      <FlowBuilder
        data={{
          event: "order.placed",
          condition: { type: "alwaysValid" },
          action: "note",
          instruction: { en: "Review source" },
        }}
        update={changed}
        catalog={{
          ...catalog,
          events: [
            ...catalog.events,
            "knowledge.document.ingested",
            "knowledge.document.archived",
            "intelligence.decision",
          ],
        }}
      />,
      { wrapper: LocaleProvider },
    );
    expect(
      screen.getByRole("option", {
        name: knowledgeWords.event_ingested[index],
      }),
    ).toHaveValue("knowledge.document.ingested");
    expect(
      screen.getByRole("option", {
        name: knowledgeWords.event_archived[index],
      }),
    ).toHaveValue("knowledge.document.archived");
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "knowledge.document.ingested" },
    });
    expect(changed).toHaveBeenLastCalledWith(
      "event",
      "knowledge.document.ingested",
    );
  },
);
