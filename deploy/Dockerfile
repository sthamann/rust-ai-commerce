# Self-hosted Rust service; credentials are supplied at runtime, never copied from .env.
FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
COPY extensions/sdk/ /build/extensions/sdk/
RUN npm run build
FROM rust:1.96-bookworm AS rust
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
COPY migrations/ migrations/
COPY extensions/ extensions/
COPY fixtures/ fixtures/
RUN cargo build --release --locked --bin vendune
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* && useradd -u 10001 -m commerce
WORKDIR /app
COPY --from=rust /build/target/release/vendune /app/vendune
COPY --from=frontend /build/frontend/dist /app/frontend/dist
COPY frontend/public /app/frontend/public
ENV BIND_ADDR=0.0.0.0:8787
USER commerce
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s CMD curl -fsS http://127.0.0.1:8787/health || exit 1
CMD ["/app/vendune"]
