/** Dictionary and localized transport failures: evaluate actual TypeScript exports without installing a test runner. */
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
let locale = "en-GB";
function module(path) {
  const source = ts.transpileModule(
    fs.readFileSync(new URL(path, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: () => ({ getLocale: () => locale, useLocale: () => ({ locale }) }),
  });
  return exports;
}
const base = module("../src/shared/i18n/locales/en.ts").en;
const shop = module("../src/shared/i18n/locales/shop-de.ts").de;
for (const language of ["en", "de", "fr", "es"]) {
  for (const [path, expected] of [
    [`../src/shared/i18n/locales/${language}.ts`, base],
    [`../src/shared/i18n/locales/shop-${language}.ts`, shop],
  ]) {
    const dict = module(path)[language];
    assert.deepEqual(Object.keys(dict).sort(), Object.keys(expected).sort());
    assert(
      Object.values(dict).every(
        (v) => typeof v === "string" && v.trim().length,
      ),
    );
  }
}
const words = module("../src/shared/i18n/workbench-i18n.ts").workbenchWords;
for (const [key, values] of Object.entries(words)) {
  assert.equal(values.length, 4, key);
  assert(
    values.every((v) => v.trim()),
    key,
  );
}
const ops = module("../src/shared/i18n/operations-i18n.ts").operationWords;
for (const [key, values] of Object.entries(ops)) {
  assert.equal(values.length, 4, key);
  assert(
    values.every((v) => v.trim()),
    key,
  );
}
const customers = module("../src/shared/i18n/customer-i18n.ts").customerWords;
for (const [key, values] of Object.entries(customers)) {
  assert.equal(values.length, 4, key);
  assert(
    values.every((v) => v.trim()),
    key,
  );
}
const connected = module("../src/shared/i18n/connected-i18n.ts").connectedWords;
for (const [key, values] of Object.entries(connected)) {
  assert.equal(values.length, 4, key);
  assert(
    values.every((v) => v.trim()),
    key,
  );
}
const email = module("../src/shared/i18n/email-i18n.ts").emailWords;
for (const [key, values] of Object.entries(email)) {
  assert.equal(values.length, 4, key);
  assert(
    values.every((v) => v.trim()),
    key,
  );
}
const { responseError } = module("../src/shared/i18n/errors-i18n.ts");
const errors = [];
const sourceErrors = [];
for (locale of ["en-GB", "de-DE", "fr-FR", "es-ES"]) {
  for (const status of [400, 401, 403, 404, 409, 429, 500, 502]) {
    const e = responseError("untranslated diagnostic", status);
    assert(e.message.length > 5);
    assert.equal(e.diagnostic, "untranslated diagnostic");
  }
  errors.push(responseError("Invalid credentials", 401).message);
  const changed = responseError("Product sources changed; ask again", 409);
  assert.equal(changed.status, 409);
  sourceErrors.push(changed.message);
}
assert.equal(new Set(errors).size, 4);
assert.equal(new Set(sourceErrors).size, 4);
console.log(
  `PASS ${Object.keys(base).length} studio + ${Object.keys(shop).length} shop + ${Object.keys(words).length} workbench keys in four languages; exact/fallback request errors localized`,
);
