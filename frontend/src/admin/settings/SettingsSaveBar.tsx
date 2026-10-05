/** Consistent settings save feedback, dirty state and permission-aware controls. */
import Icon from "../../shared/ui/Icon";
import { useStudioText } from "../../shared/i18n/studio-ui-i18n";
export default function SettingsSaveBar({
  dirty,
  busy,
  saved,
  canWrite,
}: {
  dirty: boolean;
  busy: boolean;
  saved: boolean;
  canWrite: boolean;
}) {
  const { u } = useStudioText();
  return (
    <footer className="settings-save-bar">
      <span role="status">
        <Icon
          name={
            !canWrite ? "lock" : busy ? "refresh" : dirty ? "pulse" : "check"
          }
          size={16}
        />
        {u(
          !canWrite
            ? "readOnly"
            : busy
              ? "saving"
              : saved
                ? "saved"
                : dirty
                  ? "unsaved"
                  : "upToDate",
        )}
      </span>
      {canWrite && (
        <button
          className="studio-primary"
          type="submit"
          disabled={busy || !dirty}
        >
          <Icon name="check" size={16} />
          {u(busy ? "saving" : "saveChanges")}
        </button>
      )}
    </footer>
  );
}
