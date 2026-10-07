/** Translator round trips cannot add code, lose locale keys, or partially apply an invalid import. */
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
it("round-trips tuples and rejects incomplete or incompatible edits before writing", () => {
  const root = mkdtempSync(join(tmpdir(), "vendune-catalog-"));
  const file = join(root, "sample-i18n.ts");
  const original =
    'export const words = { greeting: ["Hello {name}", "Hallo {name}", "Bonjour {name}", "Hola {name}"] } as const;';
  try {
    writeFileSync(file, original);
    const program = `import {catalogue,applyCatalogue} from ${JSON.stringify(resolve("scripts/translation-catalog.mjs"))};
      const source=${JSON.stringify(root)}, rows=catalogue(source); const document={version:1,entries:rows.map(({id,values})=>({id,values}))};
      document.entries[0].values.de='Willkommen {name}';
      const invalid=structuredClone(document); delete invalid.entries[0].values.es;
      let rejected=false; try{applyCatalogue(source,invalid)}catch{rejected=true};
      if(!rejected)throw Error('incomplete import accepted');
      const mismatch=structuredClone(document); mismatch.entries[0].values.fr='Bonjour';
      try{applyCatalogue(source,mismatch); throw Error('placeholder drift accepted')}catch(e){if(!e.message.includes('placeholders'))throw e};
      console.log(applyCatalogue(source,document));`;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", program],
      { encoding: "utf8" },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(
      original.replace("Hallo {name}", "Willkommen {name}"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("the guest SDK shares exact/main-language fallback and preserves explicit empty content", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {commerceText} from ${JSON.stringify(resolve("../extensions/sdk/browser.js"))};
    console.log(JSON.stringify([
      commerceText({'it-IT':'Ciao {name}',it:'Salve',es:'Hola'},'it-IT','es-ES',{name:'Alex'}),
      commerceText({en:'English',es:'Principal'},'de-DE','es-ES'),
      commerceText({de:'',es:'Principal'},'de-DE','es-ES'),
      commerceText({'en-US':'US',en:'Base'},'en-GB','en-US')
    ]));`,
    ],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual([
    "Ciao Alex",
    "Principal",
    "",
    "Base",
  ]);
});
