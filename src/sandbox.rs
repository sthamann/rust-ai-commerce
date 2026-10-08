//! Pure Wasmtime guest execution with bounded resources and no host imports.
use crate::sandbox_engine::{self, MEMORY_BYTES, TABLE_ELEMENTS};
use wasmtime::{Engine, Instance, Module, Store, StoreLimits, StoreLimitsBuilder};
struct Limits {
    memory: StoreLimits,
}
/// Typed integer approval and app-contribution hooks are exposed. No WASI, network, filesystem,
/// clocks or host imports. Compiled modules are reused; another replica's changed
/// source is compiled on a blocking worker before checkout invokes its hook.
pub struct Sandbox {
    engine: Engine,
    module: Option<Module>,
    component: Option<crate::component_runtime::Module>,
    source: String,
    digest: String,
}
impl Sandbox {
    pub fn component_source(source: &str) -> bool {
        source.len() <= 32768
            && wat::parse_str(source).is_ok_and(|bytes| bytes.get(4..8) == Some(&[13, 0, 1, 0]))
    }
    pub fn new(wat: &str) -> Result<Self, String> {
        if wat.len() > 32768 {
            return Err("Extension source exceeds 32 KiB".into());
        }
        let engine = sandbox_engine::shared()?;
        if Self::component_source(wat) {
            return Ok(Self {
                engine,
                module: None,
                component: Some(crate::component_runtime::Module::new(wat)?),
                source: wat.into(),
                digest: {
                    use sha2::Digest;
                    format!("{:x}", sha2::Sha256::digest(wat.as_bytes()))
                },
            });
        }
        let module = Module::new(&engine, wat).map_err(|e| e.to_string())?;
        if module.imports().len() != 0 {
            return Err("Host imports are not permitted".into());
        }
        let resources = module.resources_required();
        if !crate::verified_kernel::wasm_resources_admissible(
            resources.num_tables as u64,
            resources.num_memories as u64,
            resources.max_initial_table_size.unwrap_or(0),
            resources.max_initial_memory_size.unwrap_or(0),
        ) {
            return Err("Extension exceeds table or memory budget".into());
        }
        Ok(Self {
            engine,
            module: Some(module),
            component: None,
            source: wat.into(),
            digest: {
                use sha2::Digest;
                format!("{:x}", sha2::Sha256::digest(wat.as_bytes()))
            },
        })
    }
    pub fn is_component(&self) -> bool {
        self.component.is_some()
    }
    pub fn validate_component_abi(&self) -> Result<(), String> {
        self.component
            .as_ref()
            .ok_or("Component ABI required")?
            .validate_interface()
    }
    pub fn evaluate(
        &self,
        snapshot: crate::component_runtime::Snapshot,
        kind: crate::component_runtime::Kind,
        input: &str,
    ) -> Result<crate::component_runtime::Outcome, String> {
        self.component
            .as_ref()
            .ok_or("Component ABI required")?
            .evaluate(snapshot, kind, input)
    }
    pub fn digest(&self) -> &str {
        &self.digest
    }
    pub fn source_matches(&self, source: &str) -> bool {
        self.source == source
    }
    /// Generic cart contribution ABI; business acceptance belongs to the app module.
    pub fn contribution(&self, fee_minor: i64, input_length: i64) -> Result<i64, String> {
        let mut store = Store::new(
            &self.engine,
            Limits {
                memory: StoreLimitsBuilder::new()
                    .memory_size(MEMORY_BYTES)
                    .table_elements(TABLE_ELEMENTS)
                    .instances(1)
                    .memories(1)
                    .tables(1)
                    .build(),
            },
        );
        store.limiter(|s| &mut s.memory);
        store.set_epoch_deadline(10);
        store.set_fuel(10_000).map_err(|e| e.to_string())?;
        let instance = Instance::new(
            &mut store,
            self.module.as_ref().ok_or("Core ABI required")?,
            &[],
        )
        .map_err(|e| e.to_string())?;
        instance
            .get_typed_func::<(i64, i64), i64>(&mut store, "configuration_fee")
            .map_err(|e| e.to_string())?
            .call(&mut store, (fee_minor, input_length))
            .map_err(|e| format!("{e:#}"))
    }
    /// Verify both contribution exports and let the app validate its price input.
    pub fn validate_contribution(&self, fee: i64) -> Result<bool, String> {
        let mut store = Store::new(
            &self.engine,
            Limits {
                memory: StoreLimitsBuilder::new()
                    .memory_size(MEMORY_BYTES)
                    .table_elements(TABLE_ELEMENTS)
                    .instances(1)
                    .memories(1)
                    .tables(1)
                    .build(),
            },
        );
        store.limiter(|s| &mut s.memory);
        store.set_epoch_deadline(10);
        store.set_fuel(10_000).map_err(|e| e.to_string())?;
        let instance = Instance::new(
            &mut store,
            self.module.as_ref().ok_or("Core ABI required")?,
            &[],
        )
        .map_err(|e| e.to_string())?;
        instance
            .get_typed_func::<(i64, i64), i64>(&mut store, "configuration_fee")
            .map_err(|e| e.to_string())?;
        instance
            .get_typed_func::<i64, i32>(&mut store, "validate_fee")
            .map_err(|e| e.to_string())?
            .call(&mut store, fee)
            .map(|v| v == 1)
            .map_err(|e| format!("{e:#}"))
    }
    pub fn approve(&self, total_minor: i64, limit_minor: i64) -> Result<bool, String> {
        let mut store = Store::new(
            &self.engine,
            Limits {
                memory: StoreLimitsBuilder::new()
                    .memory_size(MEMORY_BYTES)
                    .table_elements(TABLE_ELEMENTS)
                    .instances(1)
                    .memories(1)
                    .tables(1)
                    .build(),
            },
        );
        store.limiter(|s| &mut s.memory);
        store.set_epoch_deadline(10);
        store.set_fuel(10_000).map_err(|e| e.to_string())?;
        let instance = Instance::new(
            &mut store,
            self.module.as_ref().ok_or("Core ABI required")?,
            &[],
        )
        .map_err(|e| e.to_string())?;
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
    fn oversized_private_table_is_rejected_before_instantiation() {
        // The table is deliberately not exported: checking exports alone is insufficient.
        let source = "(module (table 10001 funcref) (func (export \"approve\") (param i64 i64) (result i32) i32.const 1))";
        assert!(Sandbox::new(source).is_err());
    }
    #[test]
    fn table_growth_cannot_escape_element_budget() {
        let source = "(module (table 1 funcref) (func (export \"approve\") (param i64 i64) (result i32) ref.null func i32.const 100000000 table.grow i32.const -1 i32.eq))";
        assert!(Sandbox::new(source).unwrap().approve(0, 0).unwrap());
    }
    #[test]
    fn app_owns_contribution_rules() {
        let source = include_str!("../extensions/apps/engraving/configuration.wat");
        let engraving = Sandbox::new(source).unwrap();
        assert!(engraving.validate_contribution(300).unwrap());
        assert!(!engraving.validate_contribution(-1).unwrap());
        assert_eq!(engraving.contribution(300, 40).unwrap(), 300);
        assert_eq!(engraving.contribution(300, 41).unwrap(), -1);
        let different = Sandbox::new(&source.replace("i64.const 40", "i64.const 12")).unwrap();
        assert_eq!(different.contribution(300, 13).unwrap(), -1);
        assert_eq!(engraving.contribution(300, 13).unwrap(), 300);
        assert!(
            Sandbox::new("(module)")
                .unwrap()
                .validate_contribution(1)
                .is_err()
        );
        let trap = Sandbox::new("(module (func (export \"configuration_fee\") (param i64 i64) (result i64) (loop br 0) i64.const 0))").unwrap();
        assert!(trap.contribution(1, 1).unwrap_err().contains("fuel"));
    }
    #[test]
    fn real_guest_execution() {
        let s = Sandbox::new(include_str!("../extensions/company-limit.wat")).unwrap();
        assert!(s.approve(100, 200).unwrap());
        assert!(!s.approve(201, 200).unwrap());
    }
    #[test]
    fn example_policies_and_boundaries() {
        let cases = [
            (
                include_str!("../extensions/budget-reserve.wat"),
                90000,
                90001,
            ),
            (
                include_str!("../extensions/single-order-cap.wat"),
                25000,
                25001,
            ),
            (include_str!("../extensions/minimum-order.wat"), 5000, 4999),
        ];
        for (source, allowed, blocked) in cases {
            let guest = Sandbox::new(source).unwrap();
            assert!(guest.approve(allowed, 100000).unwrap());
            assert!(!guest.approve(blocked, 100000).unwrap());
            assert!(!guest.approve(-1, 100000).unwrap());
            assert!(!guest.approve(100001, 100000).unwrap());
        }
    }
    #[test]
    fn host_imports_and_invalid_abi_rejected() {
        assert!(Sandbox::new("(module (import \"env\" \"network\" (func)))").is_err());
        let guest =
            Sandbox::new("(module (func (export \"approve\") (result i32) i32.const 1))").unwrap();
        assert!(guest.approve(1, 2).is_err());
    }
    #[test]
    fn infinite_loop_exhausts_fuel() {
        let s=Sandbox::new("(module (func (export \"approve\") (param i64 i64) (result i32) (loop br 0) i32.const 1))").unwrap();
        assert!(s.approve(1, 2).unwrap_err().contains("fuel"));
    }
    #[test]
    fn oversized_memory_rejected() {
        assert!(Sandbox::new("(module (memory 32) (func (export \"approve\") (param i64 i64) (result i32) i32.const 1))").is_err());
    }
}
