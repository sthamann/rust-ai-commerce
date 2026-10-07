/** Contextual drawer reuses the existing scoped conversation, permissions and proposal execution without unmounting editors. */
import { useEffect, useRef } from "react";
import { useExperienceUIText } from "../../shared/i18n/experience-ui-i18n";
import { surfaceLabel } from "../../shared/apps/AppSurfaces";
import Icon from "../../shared/ui/Icon";
import { useStudio } from "../shell/StudioContext";
import StudioConversation from "../shell/StudioConversation";
import "../styles/workspace-copilot.css";
export default function WorkspaceCopilot({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { u } = useExperienceUIText();
  const {
    t,
    workspaceName,
    environment,
    environments,
    tab,
    tabLabel,
    entityTarget,
    setDraft,
    composer,
    busy,
    setSettings,
    sessionExpired,
    appSurface,
    locale,
  } = useStudio();
  useEffect(() => {
    if (sessionExpired) onClose();
  }, [sessionExpired, onClose]);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  const contextName = environment
    ? (environments.find((entry) => entry.id === environment)?.name ??
      environment)
    : workspaceName;
  const area = appSurface ? surfaceLabel(appSurface, locale) : tabLabel(tab);
  const choose = (task: "readPrompt" | "improvePrompt" | "planPrompt") => {
    setDraft(
      u("contextPrompt", {
        workspace: contextName,
        area,
        entity: entityTarget ? u("entity", { id: entityTarget.id }) : "",
        task: u(task),
      }),
    );
    requestAnimationFrame(() => composer.current?.focus());
  };
  return (
    <dialog
      ref={dialog}
      className="workspace-copilot"
      aria-labelledby="copilot-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <header className="copilot-header">
        <div>
          <span className="copilot-mark">
            <Icon name="spark" />
          </span>
          <h2 id="copilot-title">{u("copilot")}</h2>
        </div>
        <button
          className="icon-button"
          aria-label={t("close")}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="copilot-context">
        <small>{u("context")}</small>
        <strong>
          {contextName} / {area}
        </strong>
        {entityTarget && <span>{entityTarget.id}</span>}
        <p>{u("copilotHint")}</p>
        <div className="copilot-tasks">
          {(
            [
              ["readTask", "readPrompt"],
              ["improveTask", "improvePrompt"],
              ["planTask", "planPrompt"],
            ] as const
          ).map(([label, task]) => (
            <button key={task} disabled={busy} onClick={() => choose(task)}>
              {u(label)}
              <Icon name="arrow" size={14} />
            </button>
          ))}
        </div>
      </div>
      <StudioConversation
        compact
        onProviderSettings={() => {
          onClose();
          setSettings(true);
        }}
      />
    </dialog>
  );
}
