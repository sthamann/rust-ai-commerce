# MCP transport

`transport.rs` preserves app MCP opt-in and request-scoped read memoization.
It calls the existing capability dispatch; it does not own prices or permissions.
The parent `mcp.rs` owns request authentication and JSON-RPC framing.
