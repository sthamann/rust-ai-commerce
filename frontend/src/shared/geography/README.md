# Geography and inheritance

Shared country catalogue types, field-level translation fallback and an accessible
searchable picker. `EntityPicker` owns keyboard interaction; `CountryPicker` adds
localized country names, ISO aliases and continent group actions. Both Studio and
checkout consume these controls. No country checkbox walls or inferred tax rates.

`null` means inherit; an explicitly empty description stays empty. Request-bound
catalogues use the active shop and environment; do not cache across tenants.
