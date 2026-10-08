"""Compare compiled Rust production policies with Lean's extracted executable,
including every Boolean input and finite numeric edge/random cases. Tests are
bridge evidence; universal claims come from the kernel-checked theorems.
"""
import itertools,json,random,subprocess
from extract import MAX_U64

def compare(root, functions):
    cases=[];rng=random.Random(20261002)
    edges=[0,1,2,16,17,99,100,9999,10000,10001,2**31-1,2**31,2**63-1,2**63,MAX_U64-1,MAX_U64]
    for f in functions:
        options=[[False,True] if t=='bool' else edges for _,t in f.args]
        for values in itertools.product(*options):
            cases.append({'function':f.name,'args':dict(zip((n for n,_ in f.args),values))})
        if any(t=='u64' for _,t in f.args):
            for _ in range(250):
                cases.append({'function':f.name,'args':{n:rng.getrandbits(64) if t=='u64' else bool(rng.getrandbits(1)) for n,t in f.args}})
    source=''.join(json.dumps(c,separators=(',',':'))+'\n' for c in cases)
    outputs=[]
    for command in [[str(root/'target/debug/verified_kernel')],[str(root/'proof/.lake/build/bin/conformance')]]:
        run=subprocess.run(command,input=source,capture_output=True,text=True,check=True)
        outputs.append([json.loads(line)for line in run.stdout.splitlines()])
    if len(outputs[0])!=len(cases) or len(outputs[1])!=len(cases):raise ValueError('Conformance driver dropped cases')
    for case,rust,lean in zip(cases,*outputs):
        if type(rust)!=type(lean) or rust!=lean:raise ValueError(f'Rust/Lean mismatch: {case}')
    return {'cases':len(cases),'mismatches':0,'allBooleanAssignments':True,'numericBoundaryIncludesU64Max':True,'seed':20261002}
