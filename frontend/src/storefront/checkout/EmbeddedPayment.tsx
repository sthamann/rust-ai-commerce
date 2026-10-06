/** A scoped provider frame receives a short-lived token; messages only trigger server reconciliation. */
import { useEffect, useRef, useState } from "react";
import { shopApi } from "../../shared/api/shop-api";
import { useCheckoutText } from "../../shared/i18n/checkout-i18n";
type Session = {
  uiUrl: string;
  sessionToken: string;
  nonce: string;
  expiresIn: number;
};
export default function EmbeddedPayment({
  id,
  token,
  onChanged,
  approvalUrl,
}: {
  id: string;
  token: string;
  onChanged: () => void;
  approvalUrl?: string;
}) {
  const { x } = useCheckoutText(),
    frame = useRef<HTMLIFrameElement>(null),
    [session, setSession] = useState<Session>(),
    [error, setError] = useState("");
  const changed = useRef(onChanged);
  changed.current = onChanged;
  useEffect(() => {
    let active = true;
    void shopApi<Session>(
      `/store-api/payments/${id}/session?parentOrigin=${encodeURIComponent(window.location.origin)}`,
      undefined,
      token,
    )
      .then((v) => {
        if (active) setSession(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, token]);
  useEffect(() => {
    if (!session) return;
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== new URL(session.uiUrl).origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.nonce !== session.nonce ||
        !["vendune.payment.changed", "vendune.payment.redirect"].includes(
          event.data?.type,
        )
      )
        return;
      if (event.data.type === "vendune.payment.redirect") {
        if (approvalUrl && event.data.url === approvalUrl)
          window.location.assign(approvalUrl);
      } else changed.current();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [session, approvalUrl]);
  return (
    <div className="embedded-payment">
      {error && <p role="alert">{error}</p>}
      {session && (
        <iframe
          ref={frame}
          title={x("continuePay")}
          src={session.uiUrl}
          sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-popups-to-escape-sandbox"
          allow="payment"
          style={{ width: "100%", minHeight: 380, border: 0 }}
          onLoad={() =>
            frame.current?.contentWindow?.postMessage(
              {
                type: "vendune.payment.init",
                sessionToken: session.sessionToken,
                nonce: session.nonce,
              },
              new URL(session.uiUrl).origin,
            )
          }
        />
      )}
    </div>
  );
}
