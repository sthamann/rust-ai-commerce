/** A code-behind dialog edits one AST through visual blocks, BASIC syntax or agent JSON, then returns it to the manifest compiler. */
import { useCallback, useState, useRef } from "react";
import type {
  Block,
  Manifest,
  NativeView,
  Statement,
} from "../../shared/apps/native/types";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import { parseBasic, printBasic, validateAst } from "./basic-code";
import { AppCodeBuffer } from "./AppCodeBuffer";
import AppInstructionEditor from "./AppInstructionEditor";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
export default function AppLogicEditor({
  block,
  manifest,
  view,
  onClose,
  onChange,
}: {
  block: Block;
  manifest: Manifest;
  view: NativeView;
  onClose: () => void;
  onChange: (b: Block) => void;
}) {
  const { a } = useAppStudioText(),
    event = block.kind === "button" ? "click" : "change";
  const [steps, setSteps] = useState<Statement[]>(
      block.handlers?.[event] ?? [],
    ),
    [mode, setMode] = useState("blocks"),
    [source, setSource] = useState(""),
    [error, setError] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const insert = (text: string) => {
    const box = editor.current,
      start = box?.selectionStart ?? source.length,
      end = box?.selectionEnd ?? start;
    setSource(source.slice(0, start) + text + source.slice(end));
    box?.focus();
  };
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const report = useCallback(
    (id: string, value: boolean) =>
      setInvalid((old) => ({ ...old, [id]: value })),
    [],
  );
  const pending = Object.values(invalid).some(Boolean);
  const changeMode = (next: string) => {
    try {
      const parsed =
        mode === "basic"
          ? parseBasic(source)
          : mode === "json"
            ? validateAst(JSON.parse(source))
            : steps;
      setSteps(parsed);
      setSource(
        next === "basic" ? printBasic(parsed) : JSON.stringify(parsed, null, 2),
      );
      setMode(next);
      setError("");
    } catch (e) {
      setError(a("codeInvalid") + " " + (e as Error).message);
    }
  };
  const apply = () => {
    try {
      const next =
        mode === "blocks"
          ? steps
          : mode === "basic"
            ? parseBasic(source)
            : validateAst(JSON.parse(source));
      onChange({ ...block, handlers: { ...block.handlers, [event]: next } });
      onClose();
    } catch (e) {
      setError(a("codeInvalid") + " " + (e as Error).message);
    }
  };
  return (
    <AppCodeBuffer.Provider value={report}>
      <ConfirmDialog
        title={`${block.id} · ${a(event === "click" ? "clickEvent" : "changeEvent")}`}
        onCancel={onClose}
        onConfirm={apply}
        confirmLabel={a("applyCode")}
        disabled={pending}
      >
        <p>{a("codeHint")}</p>
        <div className="app-code-modes">
          {(["blocks", "basic", "json"] as const).map((m) => (
            <button
              type="button"
              key={m}
              aria-pressed={mode === m}
              disabled={pending}
              onClick={() => changeMode(m)}
            >
              {m === "blocks"
                ? a("instructions")
                : m === "basic"
                  ? a("basicSource")
                  : a("jsonAst")}
            </button>
          ))}
        </div>
        {mode === "blocks" ? (
          <AppInstructionEditor
            steps={steps}
            view={view}
            manifest={manifest}
            onChange={setSteps}
          />
        ) : (
          <>
            <textarea
              ref={editor}
              className="app-code-source"
              value={source}
              maxLength={32768}
              rows={14}
              spellCheck={false}
              onChange={(e) => setSource(e.target.value)}
            />
            <div className="app-code-completions">
              {mode === "basic" &&
                manifest.actions
                  ?.filter((x) => !x.readOnly)
                  .map((action) => (
                    <button
                      key={action.name}
                      type="button"
                      onClick={() =>
                        insert(
                          `Call ${action.name}(${view.blocks.find((b) => b.kind === "form")?.id ?? "form"}.Record)\n`,
                        )
                      }
                    >
                      {action.name}
                    </button>
                  ))}
              {mode === "basic" &&
                view.blocks
                  .filter((b) => ["table", "cards", "form"].includes(b.kind))
                  .map((b) => (
                    <button
                      key={`refresh-${b.id}`}
                      type="button"
                      onClick={() => insert(`${b.id}.Refresh\n`)}
                    >
                      {a("refreshBlock")} · {b.id}
                    </button>
                  ))}
              {view.blocks
                .filter((b) => b.kind === "form")
                .map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    onClick={() => {
                      try {
                        setSource(
                          mode === "basic"
                            ? `${source}\nValidate ${b.id}`
                            : JSON.stringify(
                                [
                                  ...validateAst(JSON.parse(source)),
                                  { op: "validate", target: b.id },
                                ],
                                null,
                                2,
                              ),
                        );
                        setError("");
                      } catch (e) {
                        setError(a("codeInvalid") + " " + (e as Error).message);
                      }
                    }}
                  >
                    {a("validateForm")} · {b.id}
                  </button>
                ))}
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </ConfirmDialog>
    </AppCodeBuffer.Provider>
  );
}
