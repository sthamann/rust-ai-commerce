# Independent Rust standard-app runtime

One compiled service owns Email Delivery, Google Analytics, Gmail and Slack. Modules
are split by HTTP/actions, typed settings/templates, crypto/persistence, distributed
queue/workers, network/SMTP, OAuth, imports and offline migration. Every Rust source
has a responsibility comment and stays within the project's 320-line limit.

[Architecture, deployment, language boundary and module map](../../docs/rust-services.md)
· [Email setup](../../docs/email-delivery.md) · [Connected apps](../../docs/connected-apps.md).
The existing app manifests, permissions, Flow Builder and MCP contract are preserved.
New critical pure retry decisions use the extracted production kernel; SQL/provider
code remains explicitly unproved. Never log request bodies, tokens or OAuth callbacks.
