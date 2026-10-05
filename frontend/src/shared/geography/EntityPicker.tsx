/** Accessible searchable country/region combobox; chips and group actions replace checkbox walls. */
import { useEffect, useId, useRef, useState } from "react";
import {
  useInternationalText,
  type InternationalWord,
} from "../i18n/international-i18n";
import "./geography.css";
export type PickerOption = {
  code: string;
  label: string;
  search?: string;
  group?: string;
  subtitle?: string;
};
export default function EntityPicker({
  options,
  value,
  onChange,
  label,
  single = false,
  disabled = false,
}: {
  options: PickerOption[];
  value: string[];
  onChange: (value: string[]) => void;
  label: string;
  single?: boolean;
  disabled?: boolean;
}) {
  const { i } = useInternationalText();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [cursor, setCursor] = useState(0),
    [limit, setLimit] = useState(60);
  const normalized = search
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const filtered = options.filter((o) =>
    [o.label, o.code, o.search ?? ""]
      .join(" ")
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .includes(normalized),
  );
  const shown = filtered.slice(0, limit),
    groups = [...new Set(shown.map((o) => o.group ?? ""))];
  const choose = (code: string) => {
    onChange(
      single
        ? [code]
        : value.includes(code)
          ? value.filter((v) => v !== code)
          : [...value, code],
    );
    if (single) {
      setOpen(false);
      setSearch("");
    }
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const groupName = (group: string) =>
    group ? i(group as InternationalWord) : "";
  return (
    <div className="geo-picker" ref={root}>
      <label htmlFor={id}>{label}</label>
      <div className="geo-selection">
        {value.slice(0, single ? 1 : 8).map((code) => (
          <span className="geo-chip" key={code}>
            {options.find((o) => o.code === code)?.label ?? code}
            {!single && (
              <button
                type="button"
                disabled={disabled}
                aria-label={`${i("remove")} ${code}`}
                onClick={() => choose(code)}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {value.length > 8 && (
          <span className="geo-count">+{value.length - 8}</span>
        )}
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={
            open && shown[cursor] ? `${id}-${shown[cursor].code}` : undefined
          }
          autoComplete="off"
          disabled={disabled}
          placeholder={i("search")}
          value={search}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            setCursor(0);
            setLimit(60);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              e.stopPropagation();
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setCursor((c) =>
                Math.max(
                  0,
                  Math.min(
                    shown.length - 1,
                    c + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (open && shown[cursor]) choose(shown[cursor].code);
            }
          }}
        />
        {!single && value.length > 0 && (
          <button
            type="button"
            className="geo-clear"
            disabled={disabled}
            onClick={() => onChange([])}
          >
            {i("clear")}
          </button>
        )}
      </div>
      {open && !disabled && (
        <div className="geo-popover">
          <div className="geo-status">
            {filtered.length} · {i("selected")}: {value.length}
          </div>
          <div
            role="listbox"
            id={`${id}-list`}
            aria-label={label}
            aria-multiselectable={!single}
          >
            {groups.map((group) => (
              <div key={group}>
                {group && (
                  <div className="geo-group">
                    <strong>{groupName(group)}</strong>
                    {!single && (
                      <button
                        type="button"
                        onClick={() =>
                          onChange([
                            ...new Set([
                              ...value,
                              ...filtered
                                .filter((o) => o.group === group)
                                .map((o) => o.code),
                            ]),
                          ])
                        }
                      >
                        {i("all")}
                      </button>
                    )}
                  </div>
                )}
                {shown
                  .filter((o) => (o.group ?? "") === group)
                  .map((o) => (
                    <button
                      type="button"
                      role="option"
                      tabIndex={-1}
                      id={`${id}-${o.code}`}
                      aria-selected={value.includes(o.code)}
                      className={
                        shown[cursor]?.code === o.code ? "geo-focused" : ""
                      }
                      key={o.code}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(o.code)}
                    >
                      <span>
                        <strong>{o.label}</strong>
                        {o.subtitle && <small>{o.subtitle}</small>}
                      </span>
                      <span>
                        {o.code} {value.includes(o.code) ? "✓" : ""}
                      </span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
          {!filtered.length && <p>{i("noResults")}</p>}
          {filtered.length > shown.length && (
            <button
              type="button"
              className="geo-more"
              onClick={() => setLimit((n) => n + 60)}
            >
              {i("more")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
