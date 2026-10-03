import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
const Merchant = lazy(() => import("./Merchant"));
const Storefront = lazy(() => import("./Storefront"));
import { LocaleProvider } from "./i18n";
const PlatformConsole = lazy(() => import("./PlatformConsole"));
function App() {
  const [platform, setPlatform] = useState(location.hash === "#platform");
  const [admin, setAdmin] = useState(
    ["#merchant", "#studio-content"].includes(location.hash),
  );
  useEffect(() => {
    const change = () => {
      setPlatform(location.hash === "#platform");
      setAdmin(["#merchant", "#studio-content"].includes(location.hash));
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  if (platform)
    return (
      <Suspense fallback={<div role="status">…</div>}>
        <PlatformConsole />
      </Suspense>
    );
  return admin ? (
    <Merchant
      onExit={() => {
        location.hash = "";
        setAdmin(false);
      }}
      onChanged={async () => {}}
    />
  ) : (
    <Storefront
      onMerchant={() => {
        location.hash = "merchant";
        setAdmin(true);
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(
  <LocaleProvider>
    <Suspense fallback={<div role="status">…</div>}>
      <App />
    </Suspense>
  </LocaleProvider>,
);
