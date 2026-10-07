/** Guest SDK: no merchant tokens or raw host API access; the host rechecks every action. */
export function commerceText(map, language, mainLocale = "en-GB", values = {}) {
  const raw = map[language] ?? map[language.split("-")[0]] ?? map[mainLocale] ?? map[mainLocale.split("-")[0]] ?? "";
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), raw);
}
const timeoutText = { en: "The app did not respond. Try again.", de: "Die App hat nicht geantwortet. Versuche es erneut.", fr: "L’app n’a pas répondu. Réessayez.", es: "La app no respondió. Inténtalo de nuevo." };
export function connectCommerce() {
  return new Promise(resolve => {
    const waiting = new Map(), observers = new Set();
    let context, sdk;
    addEventListener('message', event => {
      if (event.source !== parent) return;
      if (event.data?.type === 'commerce.context') {
        context = event.data;
        if (!sdk) {
          sdk = {
            get locale() { return context.locale; },
            get contentLocale() { return context.contentLocale ?? context.locale; },
            get mainLocale() { return context.mainLocale ?? "en-GB"; },
            get locales() { return context.locales ?? [sdk.mainLocale]; },
            text(map, values = {}) { return commerceText(map, sdk.contentLocale, sdk.mainLocale, values); },
            uiText(map, values = {}) { return commerceText(map, sdk.locale, "en-GB", values); },
            get app() { return context.app; },
            get context() { return context.context ?? {}; },
            onContext(fn) { observers.add(fn); return () => observers.delete(fn); },
            resize(height) { parent.postMessage({type:'commerce.resize', nonce:context.nonce, height}, '*'); },
            action(action, input = {}) {
              return new Promise((accept, reject) => {
                const id = crypto.randomUUID();
                const timeout = setTimeout(() => { waiting.delete(id); reject(new Error(sdk.uiText(timeoutText))); }, 15000);
                waiting.set(id, {accept, reject, timeout});
                parent.postMessage({type:'commerce.action', nonce:context.nonce, id, action, input}, '*');
              });
            }
          };
          resolve(sdk);
        }
        for (const fn of observers) fn(sdk.context);
      }
      if (context && event.data?.type === 'commerce.result' && event.data.nonce === context.nonce) {
        const pending = waiting.get(event.data.id);
        if (pending) {
          clearTimeout(pending.timeout); waiting.delete(event.data.id);
          event.data.error ? pending.reject(new Error(event.data.error)) : pending.accept(event.data.result);
        }
      }
    });
  });
}
