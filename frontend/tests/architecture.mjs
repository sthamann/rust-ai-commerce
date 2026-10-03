/** Architecture gate rejects real source regressions, including cycles and ownership violations. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'commerce-architecture-'));
const guard=path.resolve(import.meta.dirname,'../scripts/architecture.mjs');
function file(name,text){const target=path.join(directory,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,text);fs.writeFileSync(path.join(path.dirname(target),'README.md'),'# Fixture contract\n');}
function check(){return spawnSync(process.execPath,[guard,directory],{encoding:'utf8'});}
try{
 file('shared/api/base.ts','/** Shared fixture contract. */\nexport const value=1;\n');
 file('admin/orders/view.ts','/** Consumer fixture. */\nimport {value} from "../../shared/api/base";\nexport const read=()=>value;\n');
 assert.equal(check().status,0);
 file('shared/api/base.ts','/** Forbidden app dependency. */\nimport {read} from "../../admin/orders/view";\nexport const value=read();\n');
 assert.match(check().stderr,/shared boundary/);assert.match(check().stderr,/Runtime import cycle/);
 file('shared/api/base.ts','/** Missing import. */\nimport "./missing";\n');assert.match(check().stderr,/cannot resolve/);
 file('shared/api/base.ts','export const missingComment=1;\n');assert.match(check().stderr,/responsibility comment/);
 file('shared/api/base.ts','/** Too large. */\n'+Array.from({length:401},(_,i)=>`export const v${i}=1;`).join('\n'));assert.match(check().stderr,/exceeds 400/);
 file('shared/api/base.ts','/** Documented fixture. */\nexport const value=1;\n');
 fs.unlinkSync(path.join(directory,'shared/api/README.md'));assert.match(check().stderr,/folder contract/);
 console.log('PASS source ownership, runtime-cycle, missing-import, file-size, comment and documentation negative controls');
}finally{fs.rmSync(directory,{recursive:true,force:true});}
