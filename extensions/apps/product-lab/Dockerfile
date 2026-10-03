FROM python:3.13-slim
WORKDIR /app
COPY extensions/apps/product-lab /app/extensions/apps/product-lab
COPY extensions/sdk/browser.js /app/extensions/sdk/browser.js
RUN mkdir /state && chown 10001:10001 /state
ENV APP_BIND=0.0.0.0 APP_PORT=8798 APP_DB=/state/product-lab.sqlite PYTHONDONTWRITEBYTECODE=1
USER 10001:10001
EXPOSE 8798
CMD ["python", "/app/extensions/apps/product-lab/server.py"]
