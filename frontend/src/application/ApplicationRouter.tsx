/** Select independent lazy applications; contain failed imports and reset boundaries on navigation. */
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocale } from "../shared/i18n/i18n";
import WorkspaceBoundary from "../shared/ui/WorkspaceBoundary";
import { canonicalShopURL } from "../shared/api/shop-scope";
const AdminHub = lazy(() => import("../platform/AdminHub"));
const Merchant = lazy(() => import("../admin/shell/Merchant"));
const Storefront = lazy(() => import("../storefront/shell/Storefront"));
const PlatformConsole = lazy(() => import("../platform/PlatformConsole"));
export default function ApplicationRouter() {
  const { t } = useLocale();
  const canonical = canonicalShopURL(new URL(location.href));
  useEffect(() => {
    if (canonical) location.replace(canonical);
  }, [canonical]);
  const [hub, setHub] = useState(
    location.hostname === "admin.vendune.ai" && !location.hash,
  );
  const [platform, setPlatform] = useState(
    location.hash === "#platform" ||
      (!location.hash &&
        !location.search &&
        (location.hostname === "vendune.ai" ||
          location.hostname === "app.vendune.ai" ||
          location.hostname.endsWith(".code.run"))),
  );
  const [admin, setAdmin] = useState(
    ["#merchant", "#studio-content", "#login"].includes(location.hash),
  );
  useEffect(() => {
    const change = () => {
      setHub(location.hostname === "admin.vendune.ai" && !location.hash);
      setPlatform(
        location.hash === "#platform" ||
          (!location.hash &&
            !location.search &&
            (location.hostname === "vendune.ai" ||
              location.hostname === "app.vendune.ai" ||
              location.hostname.endsWith(".code.run"))),
      );
      setAdmin(
        ["#merchant", "#studio-content", "#login"].includes(location.hash),
      );
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  if (canonical) return <div role="status">…</div>;
  const content = hub ? (
    <AdminHub />
  ) : platform ? (
    <PlatformConsole />
  ) : admin ? (
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
  return (
    <WorkspaceBoundary
      key={platform ? "platform" : admin ? "studio" : "store"}
      title={t("failure")}
      retryLabel={t("refresh")}
      onRetry={() => window.location.reload()}
    >
      <Suspense fallback={<div role="status">…</div>}>{content}</Suspense>
    </WorkspaceBoundary>
  );
}
