FROM postgres:17-bookworm
ARG AGE_COMMIT=502f2c1fa32a04497dc286237186e58ac4956a53
ARG VECTOR_VERSION=v0.8.6
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git ca-certificates flex bison postgresql-server-dev-17 \
    && git clone --branch PG17 --single-branch https://github.com/apache/age.git /tmp/age \
    && cd /tmp/age && git checkout "$AGE_COMMIT" && make -j2 && make install \
    && git clone --branch "$VECTOR_VERSION" --depth 1 https://github.com/pgvector/pgvector.git /tmp/vector \
    && cd /tmp/vector && make -j2 && make install \
    && rm -rf /tmp/age /tmp/vector /var/lib/apt/lists/*
