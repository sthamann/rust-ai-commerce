/** Registered product slot for the engraving app; all configuration and prices come from the server. */
import { useEffect, useState } from "react";
import { shopApi, type Cart } from "./shop-api";
import { useAppText } from "./app-i18n";
export default function AppSlot({
  productId,
  cart,
  onCart,
}: {
  productId: string;
  cart?: Cart;
  onCart: (c: Cart) => void;
}) {
  const { a, locale } = useAppText();
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setSaved(false);
    shopApi<{ slots: { app: string }[] }>("/store-api/apps/slots")
      .then((v) => {
        if (active) setEnabled(v.slots.some((s) => s.app === "engraving"));
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [locale, productId]);
  if (!enabled) return null;
  return (
    <section className="app-slot">
      <h3>{a("engraving")}</h3>
      <p>{a("engravingHint")}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!cart) return;
          setBusy(true);
          setError("");
          try {
            onCart(
              await shopApi<Cart>(
                "/store-api/apps/engraving/configure",
                { productId, text, revision: cart.revision },
                cart.token,
              ),
            );
            setSaved(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {a("engraving")}
          <input
            value={text}
            maxLength={40}
            required
            onChange={(e) => {
              setText(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <button className="shop-secondary" disabled={!cart || busy || !text}>
          {a("save")}
        </button>
      </form>
      {saved && <p role="status">{a("engravingSaved")}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
