# Capability catalogue

`catalog.rs` lists the public HTTP/MCP names and descriptions. Authorization and dispatch remain in `../capabilities.rs`; domain modules own execution and permissions. Keeping the catalogue separate prevents new APIs from growing the dispatcher. The catalogue does not grant access.
