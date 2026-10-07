/** Opaque-origin app UI. Its SDK can invoke only this app's declared, server-authorized actions. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { RequestFn } from "../api/types";
import { useAppText } from "../i18n/app-i18n";
export default function AppFrame({
  app,
  url,
  request,
  allowedActions,
  context: surfaceContext = {},
  mainLocale = "en-GB",
  locales = ["en-GB"],
  contentLocale,
}: {
  app: string;
  url: string;
  request: RequestFn;
  allowedActions?: string[];
  context?: Record<string, unknown>;
  mainLocale?: string;
  locales?: string[];
  contentLocale?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const { locale } = useAppText();
  const nonce = useMemo(() => crypto.randomUUID(), [app, url, locale]);
  const [height, setHeight] = useState(400);
  const context = () =>
    ref.current?.contentWindow?.postMessage(
      {
        type: "commerce.context",
        app,
        locale,
        contentLocale: contentLocale ?? locale,
        mainLocale,
        locales,
        nonce,
        context: surfaceContext,
      },
      "*",
    );
  useEffect(() => {
    const listener = async (event: MessageEvent) => {
      if (
        event.source !== ref.current?.contentWindow ||
        event.origin !== "null" ||
        event.data?.nonce !== nonce
      )
        return;
      if (event.data?.type === "commerce.resize") {
        const h = event.data.height;
        if (typeof h === "number" && Number.isFinite(h))
          setHeight(Math.max(180, Math.min(1200, h)));
        return;
      }
      if (event.data?.type !== "commerce.action") return;
      const { id, action, input } = event.data;
      if (
        typeof id !== "string" ||
        typeof action !== "string" ||
        !/^[a-z][a-z0-9_]{0,31}$/.test(action) ||
        (allowedActions && !allowedActions.includes(action))
      )
        return;
      try {
        const result = await request(
          `/api/apps/${app}/actions/${action}`,
          input ?? {},
        );
        ref.current?.contentWindow?.postMessage(
          { type: "commerce.result", nonce, id, result },
          "*",
        );
      } catch (e) {
        ref.current?.contentWindow?.postMessage(
          { type: "commerce.result", nonce, id, error: (e as Error).message },
          "*",
        );
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [app, nonce, request, allowedActions]);
  useEffect(context, [
    nonce,
    surfaceContext,
    mainLocale,
    locales,
    contentLocale,
  ]);
  return (
    <iframe
      key={`${app}:${locale}`}
      ref={ref}
      src={url}
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      title={app}
      className="app-frame"
      loading="lazy"
      style={{ height }}
      onLoad={context}
    />
  );
}
