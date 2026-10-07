/** Inspect rendered expressions without mistaking condition identifiers, routes or translation keys for copy. */
import ts from "typescript";
export function renderedLiterals(node, record, resolve, seen = new Set()) {
  if (!node) return;
  if (ts.isIdentifier(node) && resolve && !seen.has(node.text)) {
    const value = resolve(node);
    if (value)
      renderedLiterals(value, record, resolve, new Set([...seen, node.text]));
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    record(node, node.text);
  else if (ts.isConditionalExpression(node)) {
    renderedLiterals(node.whenTrue, record, resolve, seen);
    renderedLiterals(node.whenFalse, record, resolve, seen);
  } else if (
    ts.isBinaryExpression(node) &&
    [
      ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.AmpersandAmpersandToken,
    ].includes(node.operatorToken.kind)
  )
    renderedLiterals(node.right, record, resolve, seen);
  else if (ts.isParenthesizedExpression(node))
    renderedLiterals(node.expression, record, resolve, seen);
  else if (ts.isTemplateExpression(node)) {
    record(node.head, node.head.text);
    for (const span of node.templateSpans) {
      renderedLiterals(span.expression, record, resolve, seen);
      record(span.literal, span.literal.text);
    }
  }
}

export function localResolver(ast) {
  const bindings = [];
  function collect(n) {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer
    ) {
      let scope = n.parent;
      while (scope && !ts.isBlock(scope) && !ts.isSourceFile(scope))
        scope = scope.parent;
      bindings.push({ name: n.name.text, value: n.initializer, scope });
    }
    ts.forEachChild(n, collect);
  }
  collect(ast);
  return (identifier) =>
    bindings
      .filter(
        (b) =>
          b.name === identifier.text &&
          b.scope.pos <= identifier.pos &&
          b.scope.end >= identifier.end,
      )
      .sort(
        (a, b) => a.scope.end - a.scope.pos - (b.scope.end - b.scope.pos),
      )[0]?.value;
}
export function placeholders(value) {
  return [...new Set(value.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) ?? [])]
    .sort()
    .join(",");
}
export function checkValues(values, context) {
  if (
    values.length !== 4 ||
    values.some((v) => typeof v !== "string" || !v.trim())
  )
    throw Error(`${context}: vocabulary needs nonempty EN/DE/FR/ES values`);
  if (values.some((v) => placeholders(v) !== placeholders(values[0])))
    throw Error(`${context}: translation placeholders differ`);
}
