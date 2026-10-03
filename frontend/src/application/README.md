# Application composition

`ApplicationRouter.tsx` selects the independent Studio, storefront and operator roots. It loads them lazily and contains failed imports/rendering with a translated reload action. It resets scope on navigation and releases its hash listener on unmount. `main.tsx` only mounts the locale provider and router.

This composition folder is allowed to import application roots; shared modules and feature applications must not depend on it. Router tests live in `tests/unit/application-router.test.tsx`. See [the source inventory](../../../docs/module-inventory.md) and [testing guide](../../../docs/testing.md).
