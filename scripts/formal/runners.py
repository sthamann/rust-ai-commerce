"""Generate conformance drivers from parsed policy signatures, never a second policy implementation."""
def lean_runner(functions):
    lines = ['import Commerce.Generated', 'import Lean.Data.Json', 'open Lean CommerceKernel', '',
        'def evalRequest (j : Json) : Except String Json := do',
        '  let name ← (j.getObjVal? "function") >>= Json.getStr?',
        '  let args ← j.getObjVal? "args"', '  match name with']
    for f in functions:
        args = ' '.join(f'((← (args.getObjVal? "{n}") >>= Json.get{"Nat" if t == "u64" else "Bool"}?))' for n,t in f.args)
        lines.append(f'  | "{f.name}" => pure (toJson ({f.name} {args}))')
    lines += ['  | _ => throw "Unknown policy"', '',
        'def main : IO Unit := do', '  let input ← IO.getStdin', '  let output ← IO.getStdout',
        '  repeat', '    let line ← input.getLine', '    if line.isEmpty then break',
        '    let result := Json.parse line >>= evalRequest', '    match result with',
        '    | .ok value => output.putStrLn value.compress',
        '    | .error reason => throw (IO.userError reason)']
    return '\n'.join(lines)+'\n'

def rust_runner(functions):
    lines = ['//! Generated conformance driver; invokes the same production policy functions as the commerce server.',
        'use vendune::verified_kernel::*;', 'use serde_json::{Value, json};',
        'use std::io::{self, BufRead};',
        'fn eval(j: &Value) -> Result<Value, String> {',
        '    let args = &j["args"];', '    match j["function"].as_str() {']
    for f in functions:
        args = ', '.join(f'args["{n}"].as_{t}().ok_or("Invalid {n}")?' for n,t in f.args)
        lines.append(f'        Some("{f.name}") => Ok(json!({f.name}({args}))),')
    lines += ['        _ => Err("Unknown policy".into()),', '    }', '}',
        'fn main() -> Result<(), Box<dyn std::error::Error>> {',
        '    for line in io::stdin().lock().lines() {',
        '        let input: Value = serde_json::from_str(&line?)?;',
        '        println!("{}", eval(&input).map_err(io::Error::other)?);', '    }', '    Ok(())', '}']
    return '\n'.join(lines)+'\n'
