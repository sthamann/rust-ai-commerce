/** Migration plans are explicit versioned agent-readable data, validated by the shared server compiler before any DDL. */
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import { useState } from "react";
import type { Manifest } from "../../shared/apps/native/types";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
export default function AppSchemaMigrations({
  manifest,
  onChange,
}: {
  manifest: Manifest;
  onChange: (m: Manifest) => void;
}) {
  const { a } = useAppStudioText(),
    [source, setSource] = useState(
      JSON.stringify(manifest.schemaMigrations ?? [], null, 2),
    ),
    [error, setError] = useState(false),
    [open, setOpen] = useState(false);
  return (
    <details>
      <summary>{a("migrationPlan")}</summary>
      <p>{a("migrationHint")}</p>
      <button
        type="button"
        className="studio-secondary"
        onClick={() => {
          setSource(JSON.stringify(manifest.schemaMigrations ?? [], null, 2));
          setError(false);
          setOpen(true);
        }}
      >
        {a("edit")}
      </button>
      {open && (
        <ConfirmDialog
          title={a("migrationPlan")}
          confirmLabel={a("applyCode")}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            try {
              const paths = JSON.parse(source);
              if (!Array.isArray(paths) || paths.length > 16) throw Error();
              onChange({ ...manifest, schemaMigrations: paths });
              setError(false);
              setOpen(false);
            } catch {
              setError(true);
            }
          }}
        >
          <textarea
            className="app-code-source"
            value={source}
            rows={8}
            maxLength={32768}
            aria-invalid={error}
            onChange={(e) => {
              setSource(e.target.value);
              setError(false);
            }}
          />
          {error && <p role="alert">{a("invalid")}</p>}
        </ConfirmDialog>
      )}
    </details>
  );
}
