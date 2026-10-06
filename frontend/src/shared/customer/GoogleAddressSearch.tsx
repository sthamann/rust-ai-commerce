/** Opt-in Places widget fills editable address fields, rejects unsupported destinations and ignores stale replies. */
import { usePurpose, openConsent } from "../legal/consent-store";
import { useEffect, useRef, useState } from "react";
import { useCheckoutText } from "../i18n/checkout-i18n";
import {
  addressFromPlace,
  browserPlacesKey,
  loadPlaces,
  type Place,
  type PlacesWidget,
} from "./google-address";
import type { Address } from "./customer-types";
export default function GoogleAddressSearch({
  value,
  onChange,
  countries,
  disabled,
}: {
  value: Address;
  onChange: (a: Address) => void;
  countries: string[];
  disabled: boolean;
}) {
  const { x } = useCheckoutText();
  const key = browserPlacesKey();
  const consent = usePurpose("maps");
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<
    | "addressLoading"
    | "addressUnavailable"
    | "addressUnsupported"
    | "addressApplied"
    | ""
  >("");
  const container = useRef<HTMLDivElement>(null),
    widget = useRef<PlacesWidget>(null);
  const latest = useRef({ value, onChange, countries, disabled });
  latest.current = { value, onChange, countries, disabled };
  useEffect(() => {
    if (!enabled || !key || !consent) return;
    let active = true,
      sequence = 0;
    setStatus("addressLoading");
    const select = async (event: Event) => {
      const n = ++sequence;
      try {
        const prediction = (
          event as Event & { placePrediction: { toPlace: () => Place } }
        ).placePrediction;
        const place = prediction.toPlace();
        await place.fetchFields({ fields: ["addressComponents"] });
        if (!active || n !== sequence || latest.current.disabled) return;
        const next = addressFromPlace(
          place.addressComponents ?? [],
          latest.current.value,
        );
        if (!latest.current.countries.includes(next.country ?? "")) {
          setStatus("addressUnsupported");
          return;
        }
        latest.current.onChange(next);
        setStatus("addressApplied");
      } catch {
        if (active && n === sequence) setStatus("addressUnavailable");
      }
    };
    const failure = () => setStatus("addressUnavailable");
    void loadPlaces(key)
      .then((library) => {
        if (!active) return;
        const w = new library.PlaceAutocompleteElement({
          includedRegionCodes: [
            latest.current.value.country ?? latest.current.countries[0],
          ].filter(Boolean),
          includedPrimaryTypes: ["street_address", "premise", "subpremise"],
        });
        w.setAttribute("aria-label", x("addressSearch"));
        w.setAttribute("placeholder", x("addressPlaceholder"));
        w.addEventListener("gmp-select", select);
        w.addEventListener("gmp-error", failure);
        widget.current = w;
        container.current?.append(w);
        setStatus("");
      })
      .catch(() => {
        if (active) setStatus("addressUnavailable");
      });
    return () => {
      active = false;
      sequence++;
      widget.current?.removeEventListener("gmp-select", select);
      widget.current?.removeEventListener("gmp-error", failure);
      widget.current?.remove();
      widget.current = null;
    };
  }, [enabled, key, consent, x("addressSearch")]);
  useEffect(() => {
    if (widget.current) {
      widget.current.includedRegionCodes = [
        value.country ?? countries[0],
      ].filter(Boolean);
      widget.current.toggleAttribute("inert", disabled);
    }
  }, [disabled, value.country, countries.join(",")]);
  if (!key) return null;
  return (
    <div className="google-address-search">
      {(!enabled || !consent) && (
        <button
          type="button"
          className="shop-secondary"
          disabled={disabled}
          onClick={() => {
            setEnabled(true);
            if (!consent) openConsent();
          }}
        >
          {x("addressSearch")}
        </button>
      )}
      <small>{x("addressConsent")}</small>
      <div ref={container} inert={disabled || undefined} />
      {status && <p role="status">{x(status)}</p>}
    </div>
  );
}
