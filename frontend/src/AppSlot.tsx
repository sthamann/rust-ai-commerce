/** Generic registered product configuration slot. App packages own labels, input names and business rules. */
import { useEffect, useState } from "react";
import { shopApi, type Cart } from "./shop-api";
import { useAppText } from "./app-i18n";
type Slot = {
  app: string;
  version: string;
  slot: { component: string; label?: Record<string, string> };
  entities?: {
    name: string;
    label: Record<string, string>;
    action?: string;
    fields: {
      name: string;
      label?: Record<string, string>;
      translatable?: boolean;
    }[];
  }[];
  configuration?: {
    inputField: string;
    label: Record<string, string>;
    hint: Record<string, string>;
  };
};
type Props = {
  productId: string;
  familyId?: string;
  cart?: Cart;
  onCart: (c: Cart) => void;
};
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
  return (
    <>
      {slots.map((slot, i) =>
        slot.slot.component === "product-configuration" &&
        slot.configuration ? (
          <ConfigurationForm
            key={`${slot.app}:${slot.version}:${props.productId}`}
            slot={slot}
            {...props}
          />
        ) : slot.slot.component === "entity-list" ? (
          <PublicEntities
            key={`${slot.app}:${i}`}
            slot={slot}
            productId={props.productId}
            familyId={props.familyId}
          />
        ) : null,
      )}
    </>
  );
}
function PublicEntities({
  slot,
  productId,
  familyId,
}: {
  slot: Slot;
  productId: string;
  familyId?: string;
}) {
  const { locale } = useAppText();
  const lang = locale.slice(0, 2);
  const [records, setRecords] = useState<
    { name: string; elements: Record<string, unknown>[] }[]
  >([]);
  useEffect(() => {
    let active = true;
    Promise.all(
      (slot.entities ?? [])
        .filter((e) => e.action)
        .map(async (e) => ({
          name: e.name,
          ...(await shopApi<{ elements: Record<string, unknown>[] }>(
            `/store-api/apps/${slot.app}/actions/${e.action}`,
            {},
          )),
        })),
    )
      .then((v) => {
        if (active) setRecords(v);
      })
      .catch(() => {
        if (active) setRecords([]);
      });
    return () => {
      active = false;
    };
  }, [slot.app, productId, locale]);
  return (
    <section className="app-slot">
      <h3>{slot.slot.label?.[lang] ?? slot.slot.label?.en ?? slot.app}</h3>
      {records.flatMap((group) =>
        group.elements
          .filter(
            (r) =>
              !r.product_id ||
              r.product_id === productId ||
              r.product_id === familyId,
          )
          .map((r) => (
            <dl key={`${group.name}:${r.id}`}>
              {slot.entities
                ?.find((e) => e.name === group.name)
                ?.fields.filter((f) => f.name !== "product_id")
                .map((f) => {
                  const value = r[f.name];
                  const text =
                    f.translatable && value && typeof value === "object"
                      ? ((value as Record<string, string>)[lang] ??
                        (value as Record<string, string>).en)
                      : String(value ?? "");
                  return (
                    <div key={f.name}>
                      <dt>{f.label?.[lang] ?? f.label?.en ?? f.name}</dt>
                      <dd>{text}</dd>
                    </div>
                  );
                })}
            </dl>
          )),
      )}
    </section>
  );
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
