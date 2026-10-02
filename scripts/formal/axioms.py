"""Audit owned proof sources and transitive Lean dependencies; no extra axioms are allowed."""
import re

FOUNDATIONS={'propext','Quot.sound','Classical.choice'}

def source_check(source):
    # Conservative: reject shortcuts even in quoted metaprograms. Comments are
    # only removed for readability; the compiled transitive audit is decisive.
    source=re.sub(r'/--.*?-/', '', source, flags=re.S)
    source=re.sub(r'--[^\n]*','',source)
    if re.search(r'\b(sorry|admit|axiom|native_decide|unsafe)\b',source):
        raise ValueError('Untrusted proof shortcut')

def dependency_check(output,names):
    for name in names:
        match=re.search(r"'CommerceKernel\."+re.escape(name)+r"' (?:does not depend on any axioms|depends on axioms: \[([^\]]*)\])",output)
        if not match:raise ValueError('Missing theorem audit: '+name)
        deps=set((match.group(1)or'').replace('\n','').replace(' ','').split(','))-{''}
        if not deps<=FOUNDATIONS:raise ValueError('Unapproved transitive axiom: '+str(deps))
    return {'theorems':len(names),'sorry':0,'customAxioms':0,'nativeDecisionAxioms':0,'allowedFoundations':sorted(FOUNDATIONS)}
