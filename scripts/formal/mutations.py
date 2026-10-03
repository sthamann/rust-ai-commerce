"""Prove the verification gate rejects representative broken policies and stale/disconnected source bindings."""
import copy,json,os,pathlib,re,subprocess,tempfile
from extract import Parser,generated
from registry import check
from axioms import source_check,dependency_check

MUTANTS=[
 ("rule_xor_count","hits == 1","hits <= 1"),
 ("flow_delay_admissible","seconds <= 2592000","true"),
 ("app_read_admissible","!mutating","true"),
 ("platform_admissible","personal &&","true &&"),
 ("platform_admissible","granted &&","true &&"),
 ("app_flow_admissible","!read_only","true"),
 ('rule_authenticated','customer_present == required','true'),
 ('rule_boolean_comparison','neq && !equal','neq && equal'),
 ('discount_cap','total.min(requested)','requested'),
 ('stock_admissible','quantity <= stock','quantity >= stock'),
 ('refund_admissible','requested <= captured.saturating_sub(refunded)','true'),
 ('revision_admissible','current == expected','true'),
 ('replay_admissible','same_cart &&','true &&'),
 ('scope_admissible','authenticated &&','true &&'),
 ('scope_admissible','known_scope &&','true &&'),
 ('scope_admissible','!explicit && default_grant','explicit && default_grant'),
 ('order_edit_admissible','!terminal','true'),
 ('completion_admissible','payment_ready && deliveries_ready','payment_ready || deliveries_ready'),
 ('cancellation_admissible','!external_payment','true'),
 ('manual_payment_admissible','!external_payment','true'),
 ('download_admissible','!order_blocked','true'),
 ('checkout_contact_admissible','billing_present','true'),
 ('receipt_admissible','expected == received','true'),
]

def mutated(source,name,old,new):
    pattern=re.compile(r'(pub fn '+name+r'\([^{}]*\) -> (?:bool|u64) \{)([^{}]*)(\})')
    match=pattern.search(source)
    if not match:raise ValueError('Mutation target missing: '+name)
    body=re.sub(r'\s+',' ',match.group(2))
    if old not in body:raise ValueError('Mutation expression missing: '+name)
    return source[:match.start(2)]+body.replace(old,new,1)+source[match.end(2):]

def proof_failures(root):
    source=(root/'src/verified_kernel.rs').read_text();claims=root/'proof/Commerce/Claims.lean'
    toolchain=(root/'proof/lean-toolchain').read_text().strip()
    with tempfile.TemporaryDirectory(prefix='commerce-proof-mutations-')as temp:
        path=pathlib.Path(temp);(path/'Commerce').mkdir();env={**os.environ,'LEAN_PATH':str(path)}
        local_claims=path/'Commerce/Claims.lean';local_claims.write_text(claims.read_text())
        def compile_model(text):
            model=path/'Commerce/Generated.lean';model.write_text(generated(Parser(text).parse()))
            run=subprocess.run(['elan','run',toolchain,'lean','Commerce/Generated.lean','-o','Commerce/Generated.olean'],cwd=path,env=env,capture_output=True,text=True)
            if run.returncode:raise ValueError('Mutation model could not compile: '+run.stdout+run.stderr)
            return subprocess.run(['elan','run',toolchain,'lean','Commerce/Claims.lean'],cwd=path,env=env,capture_output=True,text=True)
        baseline=compile_model(source)
        if baseline.returncode:raise ValueError('Negative-control baseline failed: '+baseline.stdout+baseline.stderr)
        rejecting=[(f.name, re.sub(r'\s+',' ',re.search(r'pub fn '+f.name+r'\([^{}]*\) -> (?:bool|u64) \{([^{}]*)\}',source).group(1)).strip(), 'false' if f.result=='bool' else '0') for f in Parser(source).parse()]
        for name,old,new in [*MUTANTS,*rejecting]:
            result=compile_model(mutated(source,name,old,new))
            if result.returncode==0:raise ValueError('Lean accepted broken policy '+name+': '+new)
            if not any(s in result.stdout for s in ['unsolved goals','Type mismatch','type mismatch','omega could not prove','Tactic `rfl` failed']):
                raise ValueError('Mutation failed for infrastructure rather than a property: '+result.stdout+result.stderr)
    return len(MUTANTS)+len(rejecting)

def closed_grammar():
    bad=['x + 1','x - 1','x * 2','x.wrapping_add(1)','x as u64','if true { x } else { 0 }','{ x }',
         'std::cmp::min(x,1)','unsafe { x }','panic!("x")','0.5','18446744073709551616','let y = x; y','return x;']
    for body in bad:
        try:Parser('pub fn rejected(x: u64) -> u64 { '+body+' }').parse()
        except ValueError:continue
        raise ValueError('Unsupported Rust expression accepted: '+body)
    return len(bad)

def registry_failures(root):
    manifest=json.loads((root/'proof/manifest.json').read_text());name=next(iter(manifest['sources']))
    stale=copy.deepcopy(manifest);stale['sources'][name]['sha256']='0'*64
    unclassified=copy.deepcopy(manifest);del unclassified['sources'][name]
    disconnected=copy.deepcopy(manifest);disconnected['policies']['discount_cap']['bindings']=['src/lib.rs']
    for model in [stale,unclassified,disconnected]:
        try:check(root,model)
        except ValueError:continue
        raise ValueError('Broken source inventory accepted')
    return 3

def axiom_failures():
    for shortcut in ['sorry','admit','axiom invented : False','native_decide','unsafe def unchecked := true']:
        try:source_check(shortcut)
        except ValueError:continue
        raise ValueError('Proof shortcut accepted: '+shortcut)
    for axiom in ['sorryAx','Lean.ofReduceBool','inventedAssumption']:
        try:dependency_check("'CommerceKernel.check' depends on axioms: [propext, "+axiom+"]",['check'])
        except ValueError:continue
        raise ValueError('Transitive axiom accepted: '+axiom)
    try:dependency_check('', ['missing'])
    except ValueError:pass
    else:raise ValueError('Missing theorem audit accepted')
    return 9

def run(root):
    result={'brokenPoliciesRejectedByLean':proof_failures(root),'unsupportedSyntaxRejected':closed_grammar(),
            'staleUnclassifiedDisconnectedBindingsRejected':registry_failures(root),
            'proofShortcutsUnexpectedAxiomsMissingAuditsRejected':axiom_failures(),'baselineAccepted':True}
    report=root/'artifacts/formal-mutations.json';report.parent.mkdir(parents=True,exist_ok=True);report.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2));return result
if __name__=='__main__':run(pathlib.Path(__file__).resolve().parents[2])
