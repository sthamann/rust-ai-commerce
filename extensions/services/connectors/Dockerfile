FROM python:3.13-slim
WORKDIR /app
COPY extensions/services/connectors/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home connector && mkdir /state && chown connector /state
COPY extensions/services/connectors/*.py ./
USER connector
ENV CONNECTOR_BIND=0.0.0.0 CONNECTOR_PORT=8797 CONNECTOR_DATABASE=/state/connectors.sqlite
VOLUME /state
CMD ["python3","server.py"]
