/** Opaque-origin app UI. Its SDK can invoke only this app's declared, server-authorized actions. */
import { useEffect, useMemo, useRef } from "react";
import type { RequestFn } from "./studio-types";
import { useAppText } from "./app-i18n";
export default function AppFrame({
  app,
  url,
  request,
}: {
  app: string;
  url: string;
  request: RequestFn;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const { locale } = useAppText();
  const nonce = useMemo(() => crypto.randomUUID(), [app, url, locale]);
  const context = () =>
    ref.current?.contentWindow?.postMessage(
      { type: "commerce.context", app, locale, nonce },
      "*",
    );
  useEffect(() => {
    const listener = async (event: MessageEvent) => {
      if (
        event.source !== ref.current?.contentWindow ||
        event.origin !== "null" ||
        event.data?.type !== "commerce.action" ||
        event.data?.nonce !== nonce
      )
        return;
      const { id, action, input } = event.data;
      if (
        typeof id !== "string" ||
        typeof action !== "string" ||
        !/^[a-z][a-z0-9_]{0,31}$/.test(action)
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
  }, [app, nonce, request]);
  return (
    <iframe
      key={`${app}:${locale}`}
      ref={ref}
      src={url}
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      title={app}
      className="app-frame"
      onLoad={context}
    />
  );
}
