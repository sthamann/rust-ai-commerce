/** Clickable saved app library: each card opens its latest immutable build as a new editable version. */
import { contentText } from "../../shared/i18n/content-language";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import Icon from "../../shared/ui/Icon";
import type { Build } from "./useAppStudio";
export default function AppLibrary({
  builds,
  mainLocale,
  busy,
  onOpen,
}: {
  builds: Build[];
  mainLocale: string;
  busy: boolean;
  onOpen: (build: Build) => void;
}) {
  const { a, locale } = useAppStudioText();
  const latest = builds.filter(
    (build, index) => builds.findIndex((b) => b.app === build.app) === index,
  );
  if (!latest.length) return null;
  return (
    <section className="app-library" aria-label={a("library")}>
      <h2>{a("library")}</h2>
      <div>
        {latest.map((build) => (
          <button
            key={build.app}
            className="app-library-card"
            disabled={busy}
            onClick={() => onOpen(build)}
          >
            <Icon name="layers" size={22} />
            <span>
              <strong>
                {contentText(build.manifest.name, locale, mainLocale) ||
                  build.app}
              </strong>
              <small>
                {build.app} · {build.version}
              </small>
              <span>{a("openApp")}</span>
            </span>
            <Icon name="arrow" size={16} />
          </button>
        ))}
      </div>
    </section>
  );
}
