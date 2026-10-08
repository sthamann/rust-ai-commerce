"""Explicit full-source inventory and reviewed adapter locks, not proof coverage claims."""
import hashlib,json,re
STATUSES={'unproved','extracted-policy','reviewed-binding','conformance-driver'}

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def current_sources(root):return {str(p.relative_to(root)):p for p in sorted((root/'src').rglob('*.rs'))}
def inputs(root):
    files=[*(root/'reference').glob('automation-*.json'),root/'Cargo.toml',root/'Cargo.lock',*(root/'src').rglob('*.sql'),*(root/'migrations').glob('*.sql'),*(root/'fixtures').glob('*.json'),
           root/'frontend/package.json',root/'frontend/package-lock.json',root/'frontend/scripts/precompress.mjs',root/'deploy/Dockerfile',
           root/'proof/Commerce/Claims.lean',root/'proof/lakefile.toml',root/'proof/lean-toolchain',
           root/'scripts/formal.py',*(root/'scripts/formal').glob('*.py'),root/'.github/workflows/verify.yml']
    return {str(p.relative_to(root)):p for p in sorted(files)}
def check(root,manifest):
    actual=current_sources(root);recorded=manifest['sources']
    if set(actual)!=set(recorded):raise ValueError('Unclassified/removed Rust source: '+str(set(actual)^set(recorded)))
    for name,path in actual.items():
        row=recorded[name]
        if row['status'] not in STATUSES:raise ValueError('Unknown verification status')
        if row['sha256']!=digest(path):raise ValueError('Source needs explicit verification review: '+name)
    dependencies=inputs(root)
    if set(dependencies)!=set(manifest.get('inputs',{})):raise ValueError('Unclassified schema/build/proof input')
    for name,path in dependencies.items():
        if manifest['inputs'][name]['sha256']!=digest(path):raise ValueError('Schema/build/proof input needs explicit review: '+name)
    kernel=(root/'src/verified_kernel.rs').read_text()
    for fn,row in manifest['policies'].items():
        if not re.search(r'pub fn '+re.escape(fn)+r'\(',kernel):raise ValueError('Policy removed: '+fn)
        for binding in row['bindings']:
            text=(root/binding).read_text()
            # Reviewed whole-file hash above prevents unnoticed bypasses. This is
            # a connection-presence guard, not a proof of all surrounding Rust.
            if not re.search(r'(?:verified_kernel|crate::verified_kernel)::'+re.escape(fn)+r'\(',text):
                raise ValueError('Production policy disconnected: '+fn+' in '+binding)
        if not row['bindings'] or not row['theorems']:raise ValueError('Policy lacks binding/property')
    return {'rustModules':len(actual),'extractedPolicyModules':sum(x['status']=='extracted-policy'for x in recorded.values()),
            'reviewedBindingModules':sum(x['status']=='reviewed-binding'for x in recorded.values()),
            'unprovedModules':sum(x['status']=='unproved'for x in recorded.values()),
            'reviewedSchemaBuildProofInputs':len(dependencies),'entireCoreProved':False}

def record(root,manifest,reason):
    if not reason.strip():raise ValueError('Explicit review reason required')
    binding_files={b for row in manifest['policies'].values()for b in row['bindings']}
    old=manifest.get('sources',{});rows={}
    for name,path in current_sources(root).items():
        status='extracted-policy'if name=='src/verified_kernel.rs'else'reviewed-binding'if name in binding_files else'conformance-driver'if name=='src/bin/verified_kernel.rs'else'unproved'
        rows[name]={'status':status,'sha256':digest(path),'review':reason if old.get(name,{}).get('sha256')!=digest(path) else old[name]['review']}
    manifest['sources']=rows
    prior=manifest.get('inputs',{})
    manifest['inputs']={name:{'sha256':digest(path),'review':reason if prior.get(name,{}).get('sha256')!=digest(path) else prior[name]['review']}for name,path in inputs(root).items()}
    (root/'proof/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
