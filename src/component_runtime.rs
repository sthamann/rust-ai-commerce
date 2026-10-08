//! WIT-typed read-only commerce guest. Snapshots are prepared by domain owners; no WASI, HTTP, DB or merchant credentials reach components.
use std::collections::HashMap;
use wasmtime::component::{Component, Linker};
use wasmtime::{Engine, Store, StoreLimits, StoreLimitsBuilder};
wasmtime::component::bindgen!({path:"extensions/sdk/wit",world:"extension",imports:{default:trappable}});
pub use self::vendune::commerce::context::{
    AppRecord, CartItem, CartSnapshot, Money, ProductSnapshot,
};
pub use exports::vendune::commerce::hooks::{Kind, Outcome};
#[derive(Clone)]
pub struct Snapshot {
    pub cart: CartSnapshot,
    pub products: HashMap<String, ProductSnapshot>,
    pub records: HashMap<(String, String), AppRecord>,
}
struct Host {
    snapshot: Snapshot,
    calls: u16,
    limits: StoreLimits,
}
impl Host {
    fn charge(&mut self) -> wasmtime::Result<()> {
        self.calls += 1;
        if self.calls > 128 {
            return Err(wasmtime::Error::msg("Read-only host call budget exceeded"));
        }
        Ok(())
    }
}
impl self::vendune::commerce::context::Host for Host {
    fn cart(&mut self) -> wasmtime::Result<CartSnapshot> {
        self.charge()?;
        Ok(self.snapshot.cart.clone())
    }
    fn product(&mut self, id: String) -> wasmtime::Result<Option<ProductSnapshot>> {
        self.charge()?;
        Ok(self.snapshot.products.get(&id).cloned())
    }
    fn record(&mut self, entity: String, id: String) -> wasmtime::Result<Option<AppRecord>> {
        self.charge()?;
        Ok(self.snapshot.records.get(&(entity, id)).cloned())
    }
}
pub struct Module {
    engine: Engine,
    component: Component,
}
impl Module {
    pub fn validate_interface(&self) -> Result<(), String> {
        let snapshot = Snapshot {
            cart: CartSnapshot {
                items: vec![],
                subtotal: Money {
                    minor: 0,
                    currency: "EUR".into(),
                    scale: 2,
                },
            },
            products: HashMap::new(),
            records: HashMap::new(),
        };
        let mut store = Store::new(
            &self.engine,
            Host {
                snapshot,
                calls: 0,
                limits: StoreLimitsBuilder::new()
                    .memory_size(crate::sandbox_engine::MEMORY_BYTES)
                    .table_elements(crate::sandbox_engine::TABLE_ELEMENTS)
                    .instances(4)
                    .memories(1)
                    .tables(1)
                    .build(),
            },
        );
        store.limiter(|s| &mut s.limits);
        store.set_epoch_deadline(5);
        store.set_fuel(100000).map_err(|e| e.to_string())?;
        let mut linker = Linker::new(&self.engine);
        Extension::add_to_linker::<_, wasmtime::component::HasSelf<_>>(
            &mut linker,
            |h: &mut Host| h,
        )
        .map_err(|e| e.to_string())?;
        Extension::instantiate(&mut store, &self.component, &linker)
            .map_err(|e| format!("Invalid commerce WIT ABI: {e:#}"))?;
        Ok(())
    }
    pub fn new(source: &str) -> Result<Self, String> {
        if source.len() > 32768 {
            return Err("Component source exceeds 32 KiB".into());
        }
        let engine = crate::sandbox_engine::shared()?;
        let component = Component::new(&engine, source).map_err(|e| format!("{e:#}"))?;
        let resources = component
            .resources_required()
            .ok_or("Imported modules/components are forbidden")?;
        if !crate::verified_kernel::wasm_resources_admissible(
            resources.num_tables as u64,
            resources.num_memories as u64,
            resources.max_initial_table_size.unwrap_or(0),
            resources.max_initial_memory_size.unwrap_or(0),
        ) {
            return Err("Component exceeds table/memory budget".into());
        }
        Ok(Self { engine, component })
    }
    pub fn evaluate(&self, snapshot: Snapshot, hook: Kind, input: &str) -> Result<Outcome, String> {
        if snapshot.products.len() > 100
            || snapshot.records.len() > 32
            || snapshot.cart.items.len() > 100
            || input.len() > 8192
            || snapshot
                .records
                .values()
                .map(|r| r.fields_json.len())
                .sum::<usize>()
                > 65536
        {
            return Err("Component snapshot budget exceeded".into());
        }
        let currency = snapshot.cart.subtotal.currency.clone();
        let scale = snapshot.cart.subtotal.scale;
        if currency.len() != 3
            || !currency.bytes().all(|b| b.is_ascii_uppercase())
            || scale > 3
            || snapshot
                .cart
                .items
                .iter()
                .any(|i| i.id.len() > 100 || i.price.currency != currency || i.price.scale != scale)
            || snapshot.products.iter().any(|(id, p)| {
                id.len() > 100
                    || p.id.len() > 100
                    || p.price.currency != currency
                    || p.price.scale != scale
            })
            || snapshot
                .records
                .iter()
                .any(|((entity, id), r)| entity.len() > 32 || id.len() > 100 || r.id.len() > 100)
        {
            return Err("Invalid typed commerce snapshot".into());
        }
        let mut store = Store::new(
            &self.engine,
            Host {
                snapshot,
                calls: 0,
                limits: StoreLimitsBuilder::new()
                    .memory_size(crate::sandbox_engine::MEMORY_BYTES)
                    .table_elements(crate::sandbox_engine::TABLE_ELEMENTS)
                    .instances(4)
                    .memories(1)
                    .tables(1)
                    .build(),
            },
        );
        store.limiter(|s| &mut s.limits);
        store.set_epoch_deadline(5);
        store.set_fuel(100000).map_err(|e| e.to_string())?;
        let mut linker = Linker::new(&self.engine);
        Extension::add_to_linker::<_, wasmtime::component::HasSelf<_>>(
            &mut linker,
            |h: &mut Host| h,
        )
        .map_err(|e| e.to_string())?;
        let guest = Extension::instantiate(&mut store, &self.component, &linker)
            .map_err(|e| e.to_string())?;
        let result = guest
            .vendune_commerce_hooks()
            .call_evaluate(&mut store, hook, input)
            .map_err(|e| format!("{e:#}"))?;
        if result.reason_code.len() > 100
            || !result
                .reason_code
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_')
            || result.adjustment.minor.unsigned_abs() > 100_000_000
            || result.adjustment.currency != currency
            || result.adjustment.scale != scale
            || (hook == Kind::Validation && result.adjustment.minor != 0)
        {
            return Err(
                "Component outcome is outside its declared money/reason-code bounds".into(),
            );
        }
        Ok(result)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot(minor: i64) -> Snapshot {
        Snapshot {
            cart: CartSnapshot {
                items: vec![],
                subtotal: Money {
                    minor,
                    currency: "EUR".into(),
                    scale: 2,
                },
            },
            products: HashMap::new(),
            records: HashMap::new(),
        }
    }
    #[test]
    fn real_component_reads_changed_host_snapshot_for_all_hooks() {
        let module = Module::new(include_str!(
            "../extensions/sdk/wit/snapshot-price.component.wat"
        ))
        .unwrap();
        for hook in [Kind::Price, Kind::Shipping, Kind::Discount] {
            assert_eq!(
                module
                    .evaluate(snapshot(10000), hook, "{}")
                    .unwrap()
                    .adjustment
                    .minor,
                100
            );
            assert_eq!(
                module
                    .evaluate(snapshot(25000), hook, "{}")
                    .unwrap()
                    .adjustment
                    .minor,
                250
            );
        }
        assert_eq!(
            module
                .evaluate(snapshot(10000), Kind::Validation, "{}")
                .unwrap()
                .adjustment
                .minor,
            0
        );
    }
    #[test]
    fn component_private_table_bomb_is_rejected() {
        assert!(Module::new("(component (core module $m (table 100000000 funcref)) (core instance (instantiate $m)))").is_err());
    }
    #[test]
    fn returned_money_must_match_context_and_host_calls_are_bounded() {
        let source = include_str!("../extensions/sdk/wit/snapshot-price.component.wat");
        let wrong = source.replace(
            "i32.const 528 i32.const 280 i32.load8_u",
            "i32.const 528 i32.const 3",
        );
        assert!(
            Module::new(&wrong)
                .unwrap()
                .evaluate(snapshot(100), Kind::Price, "{}")
                .unwrap_err()
                .contains("bounds")
        );
        let looped = source.replace(
            "i32.const 256 call $cart",
            "(loop $again i32.const 256 call $cart br $again)",
        );
        assert!(
            Module::new(&looped)
                .unwrap()
                .evaluate(snapshot(100), Kind::Price, "{}")
                .is_err()
        );
    }
}
