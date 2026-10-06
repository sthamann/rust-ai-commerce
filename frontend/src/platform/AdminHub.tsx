/** Public service directory. Links select a login surface without granting operator or merchant permissions. */
import Brand from "../shared/ui/Brand";
import { useControlText } from "../shared/i18n/control-i18n";
import PlatformLanguage from "./PlatformLanguage";
import "./styles/platform.css";
export default function AdminHub() {
  const t = useControlText();
  const shared = location.hostname.endsWith(".vendune.ai")
    ? "https://app.vendune.ai/"
    : "/";
  return (
    <div className="platform-console platform-hub">
      <main>
        <header>
          <Brand />
          <PlatformLanguage />
        </header>
        <div className="platform-hub-intro">
          <h1>{t("hub")}</h1>
          <p>{t("hubHint")}</p>
        </div>
        <div className="platform-hub-links">
          <a href={`${shared}#login`}>
            <span aria-hidden="true">↗</span>
            <h2>{t("merchant")}</h2>
            <p>{t("merchantHint")}</p>
          </a>
          <a href="#platform">
            <span aria-hidden="true">◎</span>
            <h2>{t("operator")}</h2>
            <p>{t("operatorHint")}</p>
          </a>
          <a
            href="https://sthamann.github.io/vendune/docs/"
            target="_blank"
            rel="noreferrer"
          >
            <span aria-hidden="true">⌘</span>
            <h2>{t("documentation")}</h2>
          </a>
        </div>
      </main>
    </div>
  );
}
