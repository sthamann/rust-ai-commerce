/** Native controls share one local execution context; form records and gateway calls remain scoped by their existing owners. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Block, NativePayload, Statement, Text } from "./types";
import type { RequestFn } from "../../api/types";
import { execute } from "./logic";
import { contentText } from "../../i18n/content-language";
import { useAppStudioText } from "../../i18n/app-studio-i18n";
export type RecordControl = {
  value: () => {
    id: string;
    revision: number;
    fields: Record<string, unknown>;
  };
  validate: () => boolean;
  accepted: (r: unknown) => void;
};
type Runtime = {
  values: Record<string, unknown>;
  epochs: Record<string, number>;
  busy: boolean;
  set: (id: string, v: unknown) => void;
  register: (id: string, c: RecordControl) => () => void;
  run: (steps: Statement[]) => Promise<void>;
  assets: (
    kind: "assets" | "asset_preview" | "asset_upload",
    body: unknown,
  ) => Promise<any>;
  productId?: string;
  lookup: (
    entity: string,
    after?: string,
  ) => Promise<{
    elements: import("./types").AppRecord[];
    nextCursor?: string;
  }>;
};
const RuntimeContext = createContext<Runtime | null>(null);
export function useNativeRuntime() {
  return useContext(RuntimeContext);
}
export default function NativeRuntime({
  app,
  native,
  request,
  locale,
  mainLocale,
  children,
  debug = false,
  context = {},
}: {
  debug?: boolean;
  context?: Record<string, unknown>;
  app: string;
  native: NativePayload;
  request: RequestFn;
  locale: string;
  mainLocale: string;
  children: ReactNode;
}) {
  const { a } = useAppStudioText();
  const [values, setValues] = useState<Record<string, unknown>>({}),
    [epochs, setEpochs] = useState<Record<string, number>>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<Text | null>(null),
    [error, setError] = useState("");
  const controls = useRef(new Map<string, RecordControl>()),
    latest = useRef(values),
    running = useRef(false),
    abort = useRef<AbortController | null>(null);
  const [traces, setTraces] = useState<
      { step: number; op: string; action?: string }[]
    >([]),
    [pause, setPause] = useState(false),
    [waiting, setWaiting] = useState(false),
    [breakAt, setBreakAt] = useState(0);
  const breakRef = useRef(breakAt);
  breakRef.current = breakAt;
  const pauseRef = useRef(false),
    continuation = useRef<(() => void) | null>(null);
  pauseRef.current = pause;
  const stop = () => {
    abort.current?.abort();
    continuation.current?.();
  };
  const register = useCallback((id: string, c: RecordControl) => {
    controls.current.set(id, c);
    return () => {
      if (controls.current.get(id) === c) controls.current.delete(id);
    };
  }, []);
  latest.current = values;
  useEffect(
    () => () => {
      abort.current?.abort();
      continuation.current?.();
    },
    [],
  );
  const find = (id: string): Block => {
    const b = native.view.blocks.find((b) => b.id === id);
    if (!b) throw new Error("APP_LOGIC_INVALID");
    return b;
  };
  const run = async (steps: Statement[]) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage(null);
    abort.current = new AbortController();
    try {
      await execute(
        steps,
        {
          value: (id, field) =>
            field
              ? controls.current.get(id)?.value().fields[field]
              : latest.current[id],
          record: (id) => {
            const c = controls.current.get(id);
            if (!c || !c.validate()) throw new Error("APP_LOGIC_VALIDATION");
            return c.value();
          },
          set: (id, v) => {
            const b = find(id);
            if (b.enabled === false || b.visible === false)
              throw new Error("APP_LOGIC_INVALID");
            latest.current = { ...latest.current, [id]: v };
            setValues(latest.current);
          },
          call: (action, input) =>
            request(`/api/apps/${app}/actions/${action}`, input),
          accepted: (id, r) => controls.current.get(id)?.accepted(r),
          message: setMessage,
          navigate: (view) => {
            const surface = native.navigation?.[view];
            if (!surface) throw new Error("APP_LOGIC_INVALID");
            window.location.hash = `app/${encodeURIComponent(app)}/${encodeURIComponent(surface)}`;
          },
          refresh: (id) => {
            find(id);
            setEpochs((old) => ({ ...old, [id]: (old[id] ?? 0) + 1 }));
          },
          validate: (id) => controls.current.get(id)?.validate() ?? false,
          trace: async (step, s) => {
            if (!debug) return;
            setTraces((old) => [
              ...old.slice(-99),
              {
                step,
                op: s.op,
                ...(s.op === "call" ? { action: s.action } : {}),
              },
            ]);
            if (pauseRef.current || step === breakRef.current) {
              setWaiting(true);
              await new Promise<void>((resolve) => {
                continuation.current = resolve;
              });
              continuation.current = null;
              setWaiting(false);
            }
          },
        },
        abort.current.signal,
      );
    } catch (e) {
      const text = (e as Error).message;
      setError(text.startsWith("APP_LOGIC_") ? a("logicError") : text);
    } finally {
      running.current = false;
      setBusy(false);
      setWaiting(false);
    }
  };
  return (
    <RuntimeContext.Provider
      value={{
        productId:
          typeof context.productId === "string" ? context.productId : undefined,
        assets: (kind, body) => {
          const action = native.assetActions?.[kind];
          if (!action)
            return Promise.reject(new Error(a("assetCapabilityMissing")));
          return request(`/api/apps/${app}/actions/${action}`, body);
        },
        lookup: (entity, after) => {
          const action = native.lookupActions?.[entity];
          if (!action)
            return Promise.reject(new Error(a("relationUnavailable")));
          return request(`/api/apps/${app}/actions/${action}`, {
            limit: 50,
            ...(after ? { after } : {}),
          });
        },
        values,
        epochs,
        busy,
        run,
        set: (id, v) => {
          latest.current = { ...latest.current, [id]: v };
          setValues(latest.current);
        },
        register,
      }}
    >
      {children}
      {debug && (
        <aside className="native-debug">
          <h4>{a("debug")}</h4>
          <label>
            <input
              type="checkbox"
              checked={pause}
              onChange={(e) => setPause(e.target.checked)}
            />
            {a("breakpoint")}
          </label>
          <label>
            {a("breakAt")}
            <input
              type="number"
              min={0}
              max={512}
              value={breakAt}
              onChange={(e) => setBreakAt(Number(e.target.value))}
            />
          </label>
          {waiting && (
            <button type="button" onClick={() => continuation.current?.()}>
              {a("continueStep")}
            </button>
          )}
          {busy && (
            <button type="button" onClick={stop}>
              {a("stopExecution")}
            </button>
          )}
          <ol>
            {traces.map((t, i) => (
              <li key={i}>
                <code>
                  {t.step} · {t.op} {t.action ?? ""}
                </code>
              </li>
            ))}
          </ol>
        </aside>
      )}
      {message && (
        <div className="native-message" role="status">
          {contentText(message, locale, mainLocale)}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </RuntimeContext.Provider>
  );
}
