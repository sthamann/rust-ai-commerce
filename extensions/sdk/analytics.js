/** Consent-bound GA4 adapter for native and headless storefronts. Never send customer identities. */
export function createAnalytics({
  shop,
  channel = "default",
  measurementId,
  storage = localStorage,
  managedConsent = false,
}) {
  const key = `rac-analytics:${shop}:${channel}`;
  let active = false;
  let script = null;
  const win = window;
  const valid = /^G-[A-Z0-9]{4,20}$/.test(measurementId || "");
  function enable() {
    if (!valid || active) return;
    active = true;
    win[`ga-disable-${measurementId}`] = false;
    win.dataLayer = win.dataLayer || [];
    win.gtag =
      win.gtag ||
      function () {
        win.dataLayer.push(arguments);
      };
    win.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    win.gtag("js", new Date());
    win.gtag("consent", "update", { analytics_storage: "granted" });
    win.gtag("config", measurementId, {
      send_page_view: false,
      page_location: location.origin + location.pathname,
      page_referrer: "",
      cookie_prefix: key.replace(/[^a-zA-Z0-9_]/g, "_"),
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.dataset.commerceAnalytics = measurementId;
    document.head.appendChild(script);
  }
  function disable() {
    active = false;
    win[`ga-disable-${measurementId}`] = true;
    script?.remove();
    script = null;
    const prefix = key.replace(/[^a-zA-Z0-9_]/g, "_");
    for (const name of (document.cookie || "")
      .split(";")
      .map((x) => x.trim().split("=")[0])
      .filter((x) => x.startsWith(prefix + "_"))) {
      const domains = ["", location.hostname];
      const parts = (location.hostname || "").split(".");
      for (let i = 1; i < parts.length - 1; i++)
        domains.push("." + parts.slice(i).join("."));
      for (const domain of domains)
        document.cookie = `${name}=; Max-Age=0; Path=/${domain ? "; Domain=" + domain : ""}; SameSite=Lax`;
    }
    if (win.gtag)
      win.gtag("consent", "update", { analytics_storage: "denied" });
  }
  const allowed = new Set([
    "view_item_list",
    "view_item",
    "add_to_cart",
    "remove_from_cart",
    "begin_checkout",
    "purchase",
    "page_view",
  ]);
  function event(name, data = {}) {
    if (!active || !allowed.has(name)) return false;
    const clean = {
      send_to: measurementId,
      currency: /^[A-Z]{3}$/.test(data.currency || "") ? data.currency : "EUR",
      sales_channel: channel,
    };
    if (data.items)
      clean.items = data.items.map((p) => ({
        item_id: String(p.item_id).slice(0, 100),
        item_name: String(p.item_name || "").slice(0, 100),
        price: Number(p.price) || 0,
        quantity: Number(p.quantity) || 1,
      }));
    if (Number.isFinite(data.value)) clean.value = data.value;
    if (name === "page_view")
      clean.page_location =
        location.origin +
        location.pathname +
        "#" +
        (location.hash.startsWith("#product/")
          ? location.hash.slice(1)
          : "collection");
    if (name === "purchase") {
      if (!data.transaction_id) return false;
      clean.transaction_id = String(data.transaction_id);
      const done = key + ":purchase:" + clean.transaction_id;
      if (storage.getItem(done)) return false;
      storage.setItem(done, "1");
    }
    win.gtag("event", name, clean);
    return true;
  }
  function consent(value) {
    storage.setItem(key, value ? "granted" : "denied");
    if (value) enable();
    else disable();
  }
  if (!managedConsent && storage.getItem(key) === "granted") enable();
  return {
    event,
    consent,
    dispose: disable,
    choice: () => storage.getItem(key),
    enabled: () => active,
  };
}
