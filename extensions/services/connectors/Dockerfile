# Independent standard-app runtime uses Rust and PostgreSQL; no Python interpreter in the image.
FROM rust:1.96-bookworm AS build
WORKDIR /build
COPY Cargo.toml Cargo.lock LICENSE ./
COPY src/ src/
COPY migrations/ migrations/
COPY extensions/ extensions/
COPY fixtures/ fixtures/
COPY reference/automation-registry.json reference/automation-registry.json
ARG BUILD_JOBS=4
RUN CARGO_BUILD_JOBS=${BUILD_JOBS} cargo build --release --locked --bin connectors
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home connector
COPY --from=build /build/target/release/connectors /app/connectors
COPY LICENSE THIRD_PARTY.md /app/
USER connector
ENV CONNECTOR_BIND=0.0.0.0 CONNECTOR_PORT=8797
EXPOSE 8797
CMD ["/app/connectors"]
