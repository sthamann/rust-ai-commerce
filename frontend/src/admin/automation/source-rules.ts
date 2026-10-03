/** Convert source condition nodes for the graphical editor without losing original payload fields. */
export type SourceDefinition = {
  type: string;
  supported: boolean;
  status: string;
  source: string;
  config: {
    operatorSet?: { operators: string[] } | null;
    fields: Record<
      string,
      { name: string; type: string; config: { options?: (string | number)[] } }
    >;
  } | null;
};
export function sourceRule(def: SourceDefinition) {
  const config: Record<string, any> = {};
  if (def.config?.operatorSet)
    config.operator = def.config.operatorSet.operators[0];
  for (const field of Object.values(def.config?.fields ?? {}))
    config[field.name] =
      field.type.includes("multi") || field.type === "tagged"
        ? []
        : field.type === "bool"
          ? true
          : ["int", "float"].includes(field.type)
            ? 1
            : (field.config.options?.[0] ?? "");
  if (
    [
      "andContainer",
      "orContainer",
      "xorContainer",
      "notContainer",
      "allLineItemsContainer",
    ].includes(def.type)
  )
    config.children = [{ type: "alwaysValid", config: {} }];
  if (def.type.endsWith("CustomField")) {
    config.operator = "=";
    config.renderedField = { name: "", type: "text" };
    config.renderedFieldValue = "";
  }
  if (def.type === "cartLineItemWrapper")
    config.container = { type: "alwaysValid", config: {} };
  return { type: "shopwareCondition", name: def.type, config };
}
export function fromSource(node: Record<string, any>) {
  return { type: "shopwareCondition", name: node.type, config: node.config };
}
export function toSource(node: Record<string, any>) {
  if (node.type === "shopwareCondition")
    return { type: node.name, config: node.config };
  const { type, ...config } = node;
  const aliases: Record<string, string> = {
    customerGroup: "customerCustomerGroup",
    cartLineItemCount: "cartLineItemsInCartCount",
    lineItemId: "cartLineItem",
  };
  const fields: Record<string, string> = {
    customerGroup: "customerGroupIds",
    salesChannel: "salesChannelIds",
    lineItemId: "identifiers",
    cartLineItem: "identifiers",
    shippingMethod: "shippingMethodIds",
    paymentMethod: "paymentMethodIds",
    customerBillingCountry: "countryIds",
    customerShippingCountry: "countryIds",
  };
  if (fields[type] && config.values) {
    config[fields[type]] = config.values;
    delete config.values;
  }
  if (config.children) config.children = config.children.map(toSource);
  if (config.child) {
    config.children = [toSource(config.child)];
    delete config.child;
  }
  return { type: aliases[type] ?? type, config };
}
