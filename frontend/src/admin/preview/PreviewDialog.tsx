/** PreviewDialog keeps merchant interaction separate from workspace orchestration. */
import { useEffect, useRef } from "react";
import { useLocale } from "../../shared/i18n/i18n";
import Icon from "../../shared/ui/Icon";
export default function PreviewDialog({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useLocale();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="studio-preview-dialog" onClose={onClose}>
      <button
        className="icon-button preview-close"
        aria-label={t("close")}
        onClick={() => ref.current?.close()}
      >
        <Icon name="close" />
      </button>
      {children}
    </dialog>
  );
}
