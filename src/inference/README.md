# Shared inference configuration

- `settings.rs`: central operator configuration, five-second replica cache, authenticated encryption of write-only keys and server-only embedding/image connections.
- `tests.rs`: native response parsing, strict schemas and truncation contracts.

`../inference.rs` owns provider protocols. The `platform` selection resolves the current central default at request time. Explicit provider/model choices remain available; disabled providers reject requests. API keys never enter browser responses. Encryption uses a persistent `PLATFORM_SECRET_KEY` (64 hexadecimal characters); retain it alongside database backups.

The embedding model stays separately pinned by `EMBEDDING_MODEL`: changing its vector space requires deliberate reindexing. Images inherit the OpenAI connection but still need `IMAGE_GENERATION_ENABLED=true` and their own `OPENAI_IMAGE_MODEL`. Neither setting automatically starts paid work.
