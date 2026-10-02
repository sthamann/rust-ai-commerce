/** Generic registered product configuration slot. App packages own labels, input names and business rules. */
import { useEffect, useState } from "react";
import { shopApi, type Cart } from "./shop-api";
import { useAppText } from "./app-i18n";
type Slot = {
  app: string;
  version: string;
  slot: { component: string };
  configuration?: {
    inputField: string;
    label: Record<string, string>;
    hint: Record<string, string>;
  };
};
type Props = { productId: string; cart?: Cart; onCart: (c: Cart) => void };
export default function AppSlot(props: Props) {
  const { locale } = useAppText();
  const [slots, setSlots] = useState<Slot[]>([]);
  useEffect(() => {
    let active = true;
    shopApi<{ slots: Slot[] }>("/store-api/apps/slots")
      .then((v) => {
        if (active) setSlots(v.slots);
      })
      .catch(() => {
        if (active) setSlots([]);
      });
    return () => {
      active = false;
    };
  }, [locale, props.productId]);
  return slots
    .filter(
      (s) => s.slot.component === "product-configuration" && s.configuration,
    )
    .map((slot) => (
      <ConfigurationForm
        key={`${slot.app}:${slot.version}:${props.productId}`}
        slot={slot}
        {...props}
      />
    ));
}
function ConfigurationForm({
  slot,
  productId,
  cart,
  onCart,
}: Props & { slot: Slot }) {
  const { a, locale } = useAppText();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = slot.configuration!;
  const label = c.label[locale.slice(0, 2)] ?? c.label.en ?? slot.app;
  const hint = c.hint[locale.slice(0, 2)] ?? c.hint.en;
  return (
    <section className="app-slot">
      <h3>{label}</h3>
      {hint && <p>{hint}</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!cart) return;
          setBusy(true);
          setError("");
          try {
            onCart(
              await shopApi<Cart>(
                `/store-api/apps/${slot.app}/configure`,
                {
                  productId,
                  fields: { [c.inputField]: text },
                  revision: cart.revision,
                },
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
          {label}
          <input
            value={text}
            maxLength={2000}
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
      {saved && <p role="status">{a("configurationSaved")}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
