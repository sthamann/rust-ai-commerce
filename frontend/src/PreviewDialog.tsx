/** PreviewDialog keeps merchant interaction separate from workspace orchestration. */
import { useEffect, useRef } from "react";
import Icon from "./Icon";
import { useLocale } from "./i18n";
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
