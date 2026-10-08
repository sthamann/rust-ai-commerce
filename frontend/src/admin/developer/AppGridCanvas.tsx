/** Drag/drop, snapping, resize and multi-selection share the published app geometry contract. */
import { controlKinds } from "../../shared/apps/native/types";
import { useRef, useState } from "react";
import type { Block, NativeView } from "../../shared/apps/native/types";
import {
  geometry,
  geometryStyle,
  snap,
} from "../../shared/apps/native/geometry";
import { contentText } from "../../shared/i18n/content-language";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
export default function AppGridCanvas({
  view,
  selected,
  onSelect,
  onChange,
  mainLocale,
  onAdd,
  onCode,
}: {
  onCode: (id: string) => void;
  view: NativeView;
  selected: string;
  onSelect: (id: string) => void;
  onChange: (blocks: Block[]) => void;
  mainLocale: string;
  onAdd: (kind: Block["kind"], position: { x: number; y: number }) => void;
}) {
  const { a, locale } = useAppStudioText();
  const ref = useRef<HTMLDivElement>(null);
  const [tabMode, setTabMode] = useState(false),
    [tabNext, setTabNext] = useState(1);
  const [classic, setClassic] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const picked = (selection.includes(selected) ? selection : [selected]).filter(
    (id) => view.blocks.some((b) => b.id === id),
  );
  const position = (x: number, y: number) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.floor((x - r.left) / Math.max(1, r.width / 12)),
      y: Math.floor((y - r.top) / 40),
    };
  };
  const patch = (id: string, g: ReturnType<typeof geometry>) =>
    onChange(
      view.blocks.map((b) => (b.id === id ? { ...b, geometry: snap(g) } : b)),
    );
  const select = (id: string, multiple: boolean) => {
    if (tabMode) {
      onChange(
        view.blocks.map((b) => (b.id === id ? { ...b, tabOrder: tabNext } : b)),
      );
      setTabNext((n) => n + 1);
      return;
    }
    onSelect(id);
    setSelection(
      multiple
        ? picked.includes(id)
          ? picked.filter((n) => n !== id)
          : [...picked, id]
        : [id],
    );
  };
  return (
    <div>
      <div className="app-grid-toolbar">
        <label>
          <input
            type="checkbox"
            checked={classic}
            onChange={(e) => setClassic(e.target.checked)}
          />
          {a("classicTheme")}
        </label>
        <button
          aria-pressed={tabMode}
          onClick={() => {
            setTabMode((v) => !v);
            setTabNext(1);
          }}
        >
          {a("tabSequence")}
        </button>
        {tabMode && <small>{a("tabSequenceHint")}</small>}
        <button
          disabled={picked.length < 2}
          onClick={() => {
            const min = Math.min(
              ...view.blocks
                .filter((b) => picked.includes(b.id))
                .map((b) => geometry(b).x),
            );
            onChange(
              view.blocks.map((b, i) =>
                picked.includes(b.id)
                  ? { ...b, geometry: snap({ ...geometry(b, i), x: min }) }
                  : b,
              ),
            );
          }}
        >
          {a("align")}
        </button>
        <button
          disabled={picked.length < 2}
          onClick={() => {
            let row = 0;
            onChange(
              view.blocks.map((b, i) => {
                if (!picked.includes(b.id)) return b;
                const g = snap({ ...geometry(b, i), y: row });
                row += g.h + 1;
                return { ...b, geometry: g };
              }),
            );
          }}
        >
          {a("distribute")}
        </button>
        <small>{a("multiSelect")}</small>
      </div>
      <div
        className={`app-form-canvas ${classic ? "classic-designer" : ""}`}
        ref={ref}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (tabMode) return;
          const id = e.dataTransfer.getData("application/vnd.vendune.block");
          const p = position(e.clientX, e.clientY),
            index = view.blocks.findIndex((b) => b.id === id);
          if (index >= 0)
            patch(id, { ...geometry(view.blocks[index], index), ...p });
          else if (view.blocks.length < 32) {
            const kind = e.dataTransfer.getData(
              "application/vnd.vendune.kind",
            ) as Block["kind"];
            if (
              ["text", "table", "cards", "form", ...controlKinds].includes(kind)
            )
              onAdd(kind, p);
          }
        }}
      >
        {view.blocks.map((b, index) => (
          <article
            key={b.id}
            style={geometryStyle(b, index)}
            className={`app-grid-block ${picked.includes(b.id) ? "selected" : ""}`}
            draggable={!tabMode}
            role="button"
            tabIndex={0}
            aria-pressed={picked.includes(b.id)}
            onKeyDown={(e) => {
              if (
                e.target === e.currentTarget &&
                ["Enter", " "].includes(e.key)
              ) {
                e.preventDefault();
                select(b.id, e.ctrlKey || e.metaKey);
              }
            }}
            onDragStart={(e) =>
              e.dataTransfer.setData("application/vnd.vendune.block", b.id)
            }
            onDoubleClick={() => {
              if (tabMode) return;
              select(b.id, false);
              if (
                [
                  "button",
                  "textbox",
                  "combobox",
                  "checkbox",
                  "datepicker",
                ].includes(b.kind)
              )
                onCode(b.id);
            }}
            onClick={(e) => select(b.id, e.ctrlKey || e.metaKey)}
          >
            <small>
              {tabMode && <strong>{b.tabOrder ?? "—"} · </strong>}
              {a(b.kind)} · {b.id}
            </small>
            <h3>{contentText(b.title, locale, mainLocale)}</h3>
            <p>{contentText(b.text ?? {}, locale, mainLocale) || b.entity}</p>
            <button
              className="app-grid-resize"
              aria-label={a("height")}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (tabMode) return;
                const start = geometry(b, index),
                  p = position(e.clientX, e.clientY);
                const target = e.currentTarget,
                  article = target.parentElement!;
                target.setPointerCapture(e.pointerId);
                const next = (ev: PointerEvent) => {
                  const end = position(ev.clientX, ev.clientY);
                  return snap({
                    ...start,
                    w: start.w + end.x - p.x,
                    h: start.h + end.y - p.y,
                  });
                };
                const draw = (g: ReturnType<typeof geometry>) => {
                  article.style.gridColumn = `${g.x + 1} / span ${g.w}`;
                  article.style.gridRow = `${g.y + 1} / span ${g.h}`;
                };
                const clear = () => {
                  target.removeEventListener("pointermove", move);
                  target.removeEventListener("pointerup", up);
                  target.removeEventListener("pointercancel", cancel);
                };
                const move = (ev: PointerEvent) => draw(next(ev));
                const up = (ev: PointerEvent) => {
                  clear();
                  patch(b.id, next(ev));
                };
                const cancel = () => {
                  clear();
                  draw(start);
                };
                target.addEventListener("pointermove", move);
                target.addEventListener("pointerup", up);
                target.addEventListener("pointercancel", cancel);
              }}
            >
              ↘
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
