/** Live consent registry starts denied; only validated server receipts unlock integrations. No legacy grant is trusted. */
import { useSyncExternalStore } from "react";
import { shopScope } from "../api/shop-scope";
import type { Consent, Purpose } from "./legal-types";
const empty: Consent = { choices: {}, policyVersion: "", decided: false };
const records = new Map<string, Consent>();
const listeners = new Set<() => void>();
const expiry = new Map<string, ReturnType<typeof setTimeout>>();
export function consentScope() {
  return `${shopScope()}:${new URLSearchParams(location.search).get("channel") ?? "default"}`;
}
export function publishConsent(value?: Consent, scope = consentScope()) {
  clearTimeout(expiry.get(scope));
  expiry.delete(scope);
  const remaining = value?.expiresAt
    ? Date.parse(value.expiresAt) - Date.now()
    : undefined;
  if (remaining != null && (!Number.isFinite(remaining) || remaining <= 0))
    value = undefined;
  records.set(scope, value ?? empty);
  if (value && remaining != null) {
    const saved = value;
    expiry.set(
      scope,
      setTimeout(
        () => publishConsent(saved, scope),
        Math.min(remaining, 2147483647),
      ),
    );
  }
  listeners.forEach((fn) => fn());
}
export function consentChoice(scope = consentScope()) {
  return records.get(scope) ?? empty;
}
export function useConsent() {
  const scope = consentScope();
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => consentChoice(scope),
    () => empty,
  );
}
export function usePurpose(purpose: Purpose) {
  const c = useConsent();
  return c.decided && c.choices[purpose] === true;
}
export function openConsent() {
  window.dispatchEvent(new Event("vendune:privacy-open"));
}
export function consentCurrent(c: Consent, policy: string, now = Date.now()) {
  return (
    c.decided &&
    c.policyVersion === policy &&
    !!c.expiresAt &&
    Date.parse(c.expiresAt) > now
  );
}
