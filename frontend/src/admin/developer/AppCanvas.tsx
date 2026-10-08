/** Accessible click-to-add canvas with selectable blocks and keyboard-accessible ordering controls. */
import { useState } from "react";
import AppLogicEditor from "./AppLogicEditor";
import { accepts } from "./control-model";
import { controlKinds, isDataBlock } from "../../shared/apps/native/types";
import AppGridCanvas from "./AppGridCanvas";
import Icon from "../../shared/ui/Icon";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
import { contentText } from "../../shared/i18n/content-language";
import type {
  Block,
  Manifest,
  NativeView,
} from "../../shared/apps/native/types";
import NativeAppView from "../../shared/apps/native/NativeAppView";
import type { RequestFn } from "../shell/studio-types";
import { snap } from "../../shared/apps/native/geometry";
import { newBlock } from "./app-model";
export default function AppCanvas({
  manifest,
  view,
  selected,
  onSelect,
  onChange,
  mainLocale,
  preview,
  previewRequest,
}: {
  manifest: Manifest;
  view: NativeView;
  selected: string;
  onSelect: (id: string) => void;
  onChange: (m: Manifest) => void;
  mainLocale: string;
  preview: boolean;
  previewRequest: RequestFn;
}) {
  const [code, setCode] = useState("");
  const { a, locale } = useAppStudioText();
  const update = (blocks: Block[]) =>
    onChange({
      ...manifest,
      views: manifest.views?.map((v) =>
        v.id === view.id ? { ...v, blocks } : v,
      ),
    });
  const add = (kind: Block["kind"]) => {
    const e =
      manifest.entities.find((e) => e.fields.some((f) => accepts(kind, f))) ??
      manifest.entities[0];
    const b = newBlock(kind, view, e?.name);
    if (
      controlKinds.includes(kind as (typeof controlKinds)[number]) &&
      isDataBlock(kind)
    )
      b.dataField = e?.fields.find((f) => accepts(kind, f))?.name;
    return b;
  };
  return (
    <div className="app-designer">
      {code && (
        <AppLogicEditor
          block={view.blocks.find((b) => b.id === code)!}
          manifest={manifest}
          view={view}
          onClose={() => setCode("")}
          onChange={(b) =>
            update(view.blocks.map((old) => (old.id === b.id ? b : old)))
          }
        />
      )}
      <aside className="app-palette">
        <span className="app-panel-label">{a("palette")}</span>
        {(["text", "table", "cards", "form", ...controlKinds] as const).map(
          (kind) => (
            <button
              key={kind}
              draggable
              onDragStart={(e) => {
                if (
                  view.blocks.length >= 32 ||
                  (isDataBlock(kind) && !manifest.entities.length)
                )
                  e.preventDefault();
                else
                  e.dataTransfer.setData("application/vnd.vendune.kind", kind);
              }}
              disabled={
                view.blocks.length >= 32 ||
                (isDataBlock(kind) && !manifest.entities.length)
              }
              onClick={() => {
                const b = add(kind);
                update([...view.blocks, b]);
                onSelect(b.id);
              }}
            >
              <Icon
                name={
                  kind === "text"
                    ? "chat"
                    : kind === "form"
                      ? "plus"
                      : kind === "cards"
                        ? "layers"
                        : "menu"
                }
              />
              <span>{a(kind)}</span>
              <Icon name="plus" size={14} />
            </button>
          ),
        )}
        <div className="app-palette-note">
          <Icon name="lock" size={16} />
          <p>{a("privateHint")}</p>
        </div>
      </aside>
      <div className="app-canvas" aria-label={a("canvas")}>
        <div className="app-canvas-label">
          <span>{a(preview ? "realPreview" : "sample")}</span>
          <span>{view.blocks.length} / 32</span>
        </div>
        {preview ? (
          <NativeAppView
            app={manifest.id}
            native={{ view, entities: manifest.entities }}
            request={previewRequest}
            allowedActions={
              manifest.surfaces?.find((s) => s.uiPath === `native/${view.id}`)
                ?.actions ?? []
            }
          />
        ) : view.layout === "form" ? (
          <AppGridCanvas
            view={view}
            onCode={setCode}
            selected={selected}
            onSelect={onSelect}
            onChange={update}
            mainLocale={mainLocale}
            onAdd={(kind, p) => {
              if (isDataBlock(kind) && !manifest.entities.length) return;
              const b = add(kind);
              b.geometry = snap({ ...p, w: 6, h: 6 });
              update([...view.blocks, b]);
              onSelect(b.id);
            }}
          />
        ) : (
          <div className={`app-design-blocks app-design-${view.layout}`}>
            {view.blocks.map((b, index) => (
              <article
                className={`app-design-block ${selected === b.id ? "selected" : ""}`}
                key={b.id}
                onDoubleClick={() => {
                  onSelect(b.id);
                  if (
                    [
                      "button",
                      "textbox",
                      "combobox",
                      "checkbox",
                      "datepicker",
                    ].includes(b.kind)
                  )
                    setCode(b.id);
                }}
              >
                <button
                  className="app-block-select"
                  aria-pressed={selected === b.id}
                  onClick={() => onSelect(b.id)}
                >
                  <span className="app-node-kind">
                    {a(b.kind)}
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </span>
                  <h3>{contentText(b.title, locale, mainLocale) || b.id}</h3>
                  {b.kind === "text" ? (
                    <p>{contentText(b.text ?? {}, locale, mainLocale)}</p>
                  ) : (
                    <>
                      <div className={`app-ghost app-ghost-${b.kind}`}>
                        {b.kind === "form" ? (
                          <>
                            <i />
                            <i />
                            <i className="app-ghost-button" />
                          </>
                        ) : (
                          <>
                            <i />
                            <i />
                            <i />
                          </>
                        )}
                      </div>
                      <span className="app-binding">
                        <Icon name="link" size={13} />
                        {a("bound")} {b.entity}
                      </span>
                    </>
                  )}
                </button>
                {selected === b.id && (
                  <div className="app-node-controls">
                    <button
                      disabled={index === 0}
                      aria-label={a("up")}
                      onClick={() => {
                        const next = [...view.blocks];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        update(next);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      disabled={index === view.blocks.length - 1}
                      aria-label={a("down")}
                      onClick={() => {
                        const next = [...view.blocks];
                        [next[index + 1], next[index]] = [
                          next[index],
                          next[index + 1],
                        ];
                        update(next);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      aria-label={a("delete")}
                      onClick={() => {
                        update(view.blocks.filter((n) => n.id !== b.id));
                        onSelect("");
                      }}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                )}
              </article>
            ))}
            {!view.blocks.length && (
              <div className="app-canvas-empty">
                <Icon name="layers" size={40} />
                <p>{a("select")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
