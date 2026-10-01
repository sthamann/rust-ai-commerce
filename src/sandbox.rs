use wasmtime::{Config, Engine, Instance, Module, Store, StoreLimits, StoreLimitsBuilder};
struct Limits {
    memory: StoreLimits,
}
/// Only a typed integer approval hook is exposed. No WASI, network, filesystem,
/// clocks or host imports. Modules are compiled at activation, never in checkout.
pub struct Sandbox {
    engine: Engine,
    module: Module,
}
impl Sandbox {
    pub fn new(wat: &str) -> Result<Self, String> {
        if wat.len() > 32768 {
            return Err("Extension source exceeds 32 KiB".into());
        }
        let mut config = Config::new();
        config.consume_fuel(true);
        config.max_wasm_stack(256 * 1024);
        let engine = Engine::new(&config).map_err(|e| e.to_string())?;
        let module = Module::new(&engine, wat).map_err(|e| e.to_string())?;
        if module.imports().len() != 0 {
            return Err("Host imports are not permitted".into());
        }
        Ok(Self { engine, module })
    }
    pub fn approve(&self, total_minor: i64, limit_minor: i64) -> Result<bool, String> {
        let mut store = Store::new(
            &self.engine,
            Limits {
                memory: StoreLimitsBuilder::new()
                    .memory_size(1 << 20)
                    .instances(1)
                    .memories(1)
                    .tables(1)
                    .build(),
            },
        );
        store.limiter(|s| &mut s.memory);
        store.set_fuel(10_000).map_err(|e| e.to_string())?;
        let instance = Instance::new(&mut store, &self.module, &[]).map_err(|e| e.to_string())?;
        let hook = instance
            .get_typed_func::<(i64, i64), i32>(&mut store, "approve")
            .map_err(|e| e.to_string())?;
        hook.call(&mut store, (total_minor, limit_minor))
            .map(|v| v != 0)
            .map_err(|e| format!("{e:#}"))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_guest_execution() {
        let s = Sandbox::new(include_str!("../extensions/company-limit.wat")).unwrap();
        assert!(s.approve(100, 200).unwrap());
        assert!(!s.approve(201, 200).unwrap());
    }
    #[test]
    fn infinite_loop_exhausts_fuel() {
        let s=Sandbox::new("(module (func (export \"approve\") (param i64 i64) (result i32) (loop br 0) i32.const 1))").unwrap();
        assert!(s.approve(1, 2).unwrap_err().contains("fuel"));
    }
    #[test]
    fn oversized_memory_rejected() {
        let s=Sandbox::new("(module (memory 32) (func (export \"approve\") (param i64 i64) (result i32) i32.const 1))").unwrap();
        assert!(s.approve(1, 2).is_err());
    }
}
