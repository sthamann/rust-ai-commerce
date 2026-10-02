#!/usr/bin/env python3
"""Run extraction, Lean proofs/axiom audit, compiled conformance and complete source-inventory checks.

No automatic review/hash refresh in CI. --record-review is a deliberate human
review record, never a claim that unproved adapters became proved.
"""
import argparse,json,pathlib,subprocess,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent/'formal'))
from extract import Parser,generated
from runners import lean_runner,rust_runner
from registry import check,record
from conformance import compare
from axioms import source_check,dependency_check
ROOT=pathlib.Path(__file__).resolve().parents[1]

def run(args,cwd=ROOT):
    result=subprocess.run(args,cwd=cwd,capture_output=True,text=True)
    if result.returncode:raise RuntimeError(result.stdout+result.stderr)
    return result.stdout

def artifacts(functions):
    lean=generated(functions);main=lean_runner(functions);rust=rust_runner(functions)
    # Rustfmt is part of the driver-generation boundary; compare canonical source.
    rust=subprocess.run(['rustfmt','--edition','2024'],input=rust,capture_output=True,text=True,check=True).stdout
    return {'proof/Commerce/Generated.lean':lean,'proof/Main.lean':main,'src/bin/verified_kernel.rs':rust}

def audit(manifest):
    root=ROOT/'proof'
    names=sorted({n for v in manifest['policies'].values()for n in v['theorems']})
    owned=list(root.rglob('*.lean'));owned=[p for p in owned if '.lake'not in p.parts]
    for path in owned:
        source_check(path.read_text())
    text='import Commerce.Claims\n'+''.join('#print axioms CommerceKernel.'+name+'\n'for name in names)
    path=root/'Commerce/Audit.lean'
    if not path.exists()or path.read_text()!=text:raise ValueError('Axiom audit out of date; regenerate explicitly')
    output=run(['lake','env','lean','Commerce/Audit.lean'],root)
    return dependency_check(output,names)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--generate',action='store_true');parser.add_argument('--record-review',metavar='REASON')
    parser.add_argument('--report',default='artifacts/formal-verification.json');args=parser.parse_args()
    manifest=json.loads((ROOT/'proof/manifest.json').read_text())
    functions=Parser((ROOT/'src/verified_kernel.rs').read_text()).parse()
    if {f.name for f in functions}!=set(manifest['policies']):raise ValueError('Policy inventory incomplete')
    files=artifacts(functions)
    names=sorted({n for v in manifest['policies'].values()for n in v['theorems']})
    files['proof/Commerce/Audit.lean']='import Commerce.Claims\n'+''.join('#print axioms CommerceKernel.'+n+'\n'for n in names)
    for name,content in files.items():
        path=ROOT/name
        if args.generate:path.write_text(content)
        elif not path.exists()or path.read_text()!=content:raise ValueError('Generated artifact drift: '+name)
    if args.record_review:record(ROOT,manifest,args.record_review)
    inventory=check(ROOT,manifest)
    run(['lake','build'],ROOT/'proof')
    run(['lake','env','leanchecker','Commerce'],ROOT/'proof')
    axioms=audit(manifest)
    run(['cargo','build','--locked','--bin','verified_kernel']);conformance=compare(ROOT,functions)
    report={'status':'passed','scope':'Extracted production policies; NOT full Rust/server correctness',
        'sourceCommit':run(['git','rev-parse','HEAD']).strip(),'workingTreeChanged':bool(run(['git','status','--porcelain']).strip()),
        'leanToolchain':(ROOT/'proof/lean-toolchain').read_text().strip(),'policies':len(functions),
        'axiomAudit':axioms,'compiledEnvironmentRechecked':True,'conformance':conformance,'inventory':inventory,
        'trustedBoundary':['Rust-to-Lean subset translator','Rust/Lean compilation and u64-to-Nat correspondence','Reviewed Rust adapters and input facts','PostgreSQL transactions/constraints','Operating system and provider protocols']}
    path=ROOT/args.report;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
