//! Bounded weighted LRU for immutable decoded read models; no network I/O under its mutex.
use std::{collections::HashMap, hash::Hash, sync::Arc};

struct Entry<V> {
    value: Arc<V>,
    weight: usize,
    used: u64,
}
pub(crate) struct Cache<K, V> {
    entries: HashMap<K, Entry<V>>,
    capacity: usize,
    budget: usize,
    weight: usize,
    clock: u64,
}
impl<K: Eq + Hash + Clone, V> Cache<K, V> {
    pub(crate) fn new(capacity: usize, budget: usize) -> Self {
        Self {
            entries: HashMap::new(),
            capacity,
            budget,
            weight: 0,
            clock: 0,
        }
    }
    pub(crate) fn get(&mut self, key: &K) -> Option<Arc<V>> {
        self.clock = self.clock.saturating_add(1);
        let entry = self.entries.get_mut(key)?;
        entry.used = self.clock;
        Some(entry.value.clone())
    }
    pub(crate) fn insert(&mut self, key: K, value: Arc<V>, weight: usize) {
        if let Some(old) = self.entries.remove(&key) {
            self.weight -= old.weight;
        }
        if weight > self.budget || self.capacity == 0 {
            return;
        }
        while self.entries.len() >= self.capacity || self.weight + weight > self.budget {
            let oldest = self
                .entries
                .iter()
                .min_by_key(|(_, e)| e.used)
                .map(|(k, _)| k.clone());
            if let Some(oldest) = oldest {
                self.weight -= self.entries.remove(&oldest).unwrap().weight;
            } else {
                break;
            }
        }
        self.clock = self.clock.saturating_add(1);
        self.weight += weight;
        self.entries.insert(
            key,
            Entry {
                value,
                weight,
                used: self.clock,
            },
        );
    }
    pub(crate) fn remove_where(&mut self, predicate: impl Fn(&K) -> bool) {
        self.entries.retain(|key, entry| {
            if predicate(key) {
                self.weight -= entry.weight;
                false
            } else {
                true
            }
        });
    }
    pub(crate) fn usage(&self) -> (usize, usize) {
        (self.entries.len(), self.weight)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scoped_eviction_preserves_foreign_entries_and_owned_snapshots() {
        let mut cache = Cache::new(3, 20);
        cache.insert(("a", "default"), Arc::new(1), 4);
        cache.insert(("a", "second"), Arc::new(2), 4);
        cache.insert(("b", "default"), Arc::new(3), 4);
        let snapshot = cache.get(&("a", "default")).unwrap();
        cache.remove_where(|(tenant, _)| *tenant == "a");
        assert_eq!(cache.usage(), (1, 4));
        assert_eq!(*cache.get(&("b", "default")).unwrap(), 3);
        assert_eq!(*snapshot, 1);
        assert!(cache.get(&("a", "default")).is_none());
    }
    #[test]
    fn bounded_weighted_eviction_preserves_recent_entries_and_owned_snapshots() {
        let mut cache = Cache::new(2, 10);
        cache.insert("a", Arc::new(1), 4);
        cache.insert("b", Arc::new(2), 4);
        let snapshot = cache.get(&"a").unwrap();
        cache.insert("c", Arc::new(3), 4);
        assert!(cache.get(&"b").is_none());
        assert_eq!(*snapshot, 1);
        cache.insert("c", Arc::new(4), 7);
        assert_eq!(cache.usage(), (1, 7));
        cache.insert("c", Arc::new(5), 11);
        assert_eq!(cache.usage(), (0, 0));
    }
}
