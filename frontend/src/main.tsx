import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Merchant from "./Merchant";
import Storefront from "./Storefront";
import { LocaleProvider } from "./i18n";
function App() {
  const [admin, setAdmin] = useState(
    ["#merchant", "#studio-content"].includes(location.hash),
  );
  useEffect(() => {
    const change = () => {
      setAdmin(["#merchant", "#studio-content"].includes(location.hash));
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
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
    <App />
  </LocaleProvider>,
);
