/** Shared passive navigation from Apps and Storyfronts to the same authorized original editor. */
import Icon from "../../shared/ui/Icon";
import { useLocale } from "../../shared/i18n/i18n";
import { useStoryfrontText } from "./storyfront-i18n";
import { connectionUrl, type FrontendConnection } from "./storyfront-model";
import "../styles/storyfronts.css";
export default function StoryfrontConnections({
  frontends,
}: {
  frontends: FrontendConnection[];
}) {
  const { locale } = useLocale(),
    text = useStoryfrontText();
  return (
    <div className="storyfront-grid">
      {frontends.map((f) => {
        const url = connectionUrl(f.url),
          editor = connectionUrl(f.editorUrl, locale);
        return (
          <article className="studio-card storyfront-card" key={f.alias}>
            <div className="storyfront-card-cover">
              <Icon name="layers" />
              <span>{text("connected")}</span>
            </div>
            <div className="storyfront-card-body">
              <h2>{f.alias}</h2>
              <p className="storyfront-address">
                {url ? new URL(url).hostname : f.alias}
              </p>
              <dl>
                <dt>{text("channel")}</dt>
                <dd>{f.channel}</dd>
              </dl>
              <div className="storyfront-card-actions">
                {editor ? (
                  <a
                    className="studio-primary"
                    href={editor}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="settings" />
                    {text("edit")}
                  </a>
                ) : (
                  <p>{text("editorMissing")}</p>
                )}
                {url && (
                  <a
                    className="studio-secondary"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="arrow" />
                    {text("open")}
                  </a>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
