/** Shared modal confirmation with focus containment, Escape, focus restoration and an explicit destructive action. */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useWorkspaceText } from "../i18n/workspace-i18n";
import "./confirm-dialog.css";
export default function ConfirmDialog({
  title,
  children,
  onCancel,
  onConfirm,
  confirmLabel,
  disabled = false,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  disabled?: boolean;
}) {
  const { w } = useWorkspaceText(),
    id = useId(),
    root = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel.current();
      }
      if (e.key !== "Tab") return;
      const items = [
        ...root.current!.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
        ),
      ];
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div className="confirm-overlay">
      <div
        ref={root}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <h2 id={id}>{title}</h2>
        <div className="confirm-content">{children}</div>
        <footer>
          <button type="button" className="studio-secondary" onClick={onCancel}>
            {w("cancel")}
          </button>
          <button
            type="button"
            className="studio-primary"
            disabled={disabled}
            onClick={onConfirm}
          >
            {confirmLabel ?? w("confirm")}
          </button>
        </footer>
      </div>
    </div>,
    document.querySelector(".studio") ?? document.body,
  );
}
