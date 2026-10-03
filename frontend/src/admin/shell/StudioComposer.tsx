/** StudioComposer: focused Studio view; state and commands come from the session-scoped controller. */
import { locales } from "../../shared/i18n/i18n";
import "../../shared/styles/workbench.css";
import Icon from "../../shared/ui/Icon";
import "../styles/operations.css";
import "../styles/studio.css";

import { useStudio } from "./StudioContext";

export default function StudioComposer() {
  const { send, t, composer, draft, setDraft, connected, busy, locale } =
    useStudio();
  return (
    <div className="composer-wrap">
      <form
        className="studio-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="studio-message">
          {t("message")}
        </label>
        <textarea
          id="studio-message"
          ref={composer}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t("placeholder")}
        />
        <div>
          <span>
            <Icon name="lock" size={13} />
            {t("trust")}
          </span>
          <button
            type="submit"
            className="studio-primary"
            disabled={!connected || busy || !draft.trim()}
            aria-label={t("send")}
          >
            <Icon name="send" size={18} />
          </button>
        </div>
      </form>
      <small>
        {t("currentLocale")}: {locales[locale]} · {t("savedLanguage")}
      </small>
    </div>
  );
}
