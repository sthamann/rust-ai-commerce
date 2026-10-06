/** Google Places adapter: lazy public browser key, bounded loader and international address mapping. */
import type { Address } from "./customer-types";
export type AddressComponent = {
  types: string[];
  longText: string;
  shortText?: string;
};
export type Place = {
  addressComponents?: AddressComponent[];
  fetchFields: (options: { fields: string[] }) => Promise<unknown>;
};
export type PlacesWidget = HTMLElement & { includedRegionCodes: string[] };
export type PlacesLibrary = {
  PlaceAutocompleteElement: new (options: {
    includedRegionCodes: string[];
    includedPrimaryTypes: string[];
  }) => PlacesWidget;
};
type MapsWindow = Window & {
  google?: {
    maps: { importLibrary: (name: string) => Promise<PlacesLibrary> };
  };
  vendunePlacesReady?: () => void;
};
const mapsWindow = () => window as MapsWindow;
let loading: Promise<PlacesLibrary> | undefined;
export function browserPlacesKey(): string {
  return (
    (
      import.meta as ImportMeta & { env?: Record<string, string> }
    ).env?.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ""
  );
}
export function loadPlaces(key: string): Promise<PlacesLibrary> {
  if (loading) return loading;
  if (!key) return Promise.reject(new Error("Places not configured"));
  loading = new Promise<void>((resolve, reject) => {
    if (mapsWindow().google?.maps.importLibrary) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, libraries: "places", v: "weekly", loading: "async", callback: "vendunePlacesReady" })}`;
    script.async = true;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    const timer = window.setTimeout(() => fail(), 15000);
    const clear = () => {
      window.clearTimeout(timer);
      delete mapsWindow().vendunePlacesReady;
    };
    const fail = () => {
      clear();
      script.remove();
      reject(new Error("Places unavailable"));
    };
    mapsWindow().vendunePlacesReady = () => {
      clear();
      resolve();
    };
    script.onerror = fail;
    document.head.append(script);
  })
    .then(() => mapsWindow().google!.maps.importLibrary("places"))
    .catch((e) => {
      loading = undefined;
      throw e;
    });
  return loading;
}
export function addressFromPlace(
  components: AddressComponent[],
  old: Address,
): Address {
  const part = (type: string, short = false) => {
    const c = components.find((v) => v.types.includes(type));
    return (short ? c?.shortText : c?.longText) ?? c?.longText ?? "";
  };
  const country = part("country", true).toUpperCase();
  const number = part("street_number"),
    route = part("route");
  const street = ["US", "CA", "GB", "AU", "NZ", "IE"].includes(country)
    ? [number, route].filter(Boolean).join(" ")
    : [route, number].filter(Boolean).join(" ");
  const postalCode = [part("postal_code"), part("postal_code_suffix")]
    .filter(Boolean)
    .join("-");
  const state = part("administrative_area_level_1", true);
  return {
    ...old,
    street,
    postalCode,
    city:
      part("postal_town") ||
      part("locality") ||
      part("sublocality_level_1") ||
      part("administrative_area_level_2"),
    country,
    countryStateId: state ? `${country}-${state}` : "",
  };
}
