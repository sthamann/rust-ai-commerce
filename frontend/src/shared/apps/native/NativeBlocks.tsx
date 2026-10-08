/** All native controls render from the same validated manifest, including one-level containers and code-behind buttons. */
import { useState } from "react";
import type { Block, NativePayload } from "./types";
import type { RequestFn } from "../../api/types";
import { contentText } from "../../i18n/content-language";
import { geometryStyle } from "./geometry";
import { useNativeRuntime } from "./NativeRuntime";
import NativeDataBlock from "./NativeDataBlock";
export default function NativeBlocks({
  app,
  native,
  request,
  locale,
  mainLocale,
  isPublic,
  context,
}: {
  app: string;
  native: NativePayload;
  request: RequestFn;
  locale: string;
  mainLocale: string;
  isPublic: boolean;
  context: Record<string, unknown>;
}) {
  const runtime = useNativeRuntime();
  const [dataEpoch, setDataEpoch] = useState(0),
    [tabs, setTabs] = useState<Record<string, string>>({});
  const nested = new Set(
    native.view.blocks.flatMap((b) => b.childBlocks ?? []),
  );
  const render = (b: Block, index: number, child = false): React.ReactNode => {
    if (b.visible === false || (isPublic && b.kind === "form")) return null;
    const entity = native.entities.find((e) => e.name === b.entity),
      title = contentText(b.title, locale, mainLocale);
    const children = (b.childBlocks ?? [])
      .map((id) => native.view.blocks.find((n) => n.id === id))
      .filter((n): n is Block => !!n && n.visible !== false)
      .sort((a, b) => (a.tabOrder ?? 1001) - (b.tabOrder ?? 1001));
    const tab = tabs[b.id] ?? children[0]?.id;
    return (
      <section
        key={b.id}
        className={`native-block native-block-${b.kind}`}
        style={
          !child && native.view.layout === "form"
            ? geometryStyle(b, index)
            : undefined
        }
        title={contentText(b.tooltip ?? {}, locale, mainLocale)}
      >
        {b.kind !== "button" && <h3>{title}</h3>}
        {b.kind === "text" ? (
          <p className="native-text">
            {contentText(b.text ?? {}, locale, mainLocale)}
          </p>
        ) : b.kind === "button" ? (
          <button
            type="button"
            className="studio-primary"
            tabIndex={0}
            disabled={b.enabled === false || runtime?.busy}
            onClick={() => void runtime?.run(b.handlers?.click ?? [])}
          >
            {title}
          </button>
        ) : b.kind === "frame" || b.kind === "tabs" ? (
          <fieldset disabled={b.enabled === false} className="native-fieldset">
            {b.kind === "tabs" && (
              <div role="tablist" aria-label={title}>
                {children.map((c) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={c.id === tab}
                    key={c.id}
                    onClick={() => setTabs((old) => ({ ...old, [b.id]: c.id }))}
                  >
                    {contentText(c.title, locale, mainLocale)}
                  </button>
                ))}
              </div>
            )}
            {children
              .filter((c) => b.kind !== "tabs" || c.id === tab)
              .map((c) => render(c, 0, true))}
          </fieldset>
        ) : entity ? (
          <fieldset disabled={b.enabled === false} className="native-fieldset">
            <NativeDataBlock
              app={app}
              block={b}
              entity={entity}
              request={request}
              mainLocale={mainLocale}
              displayLocale={locale}
              dataEpoch={b.kind === "form" ? 0 : dataEpoch}
              context={context}
              tenant={native.tenant}
              onSaved={() => setDataEpoch((n) => n + 1)}
            />
          </fieldset>
        ) : null}
      </section>
    );
  };
  return (
    <div className={`native-app native-app-${native.view.layout}`}>
      {native.view.blocks
        .map((b, i) => ({ b, i }))
        .sort((a, b) => (a.b.tabOrder ?? 1001) - (b.b.tabOrder ?? 1001))
        .map(({ b, i }) => (nested.has(b.id) ? null : render(b, i)))}
    </div>
  );
}
