/** Studio session/controller: authentication context, tenant/staging state and chat commands. */
import { useCallback, useEffect, useRef, useState } from "react";
import { type AppSurface } from "../../shared/apps/AppSurfaces";
import { useConnectedText } from "../../shared/i18n/connected-i18n";
import { useLocale } from "../../shared/i18n/i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import "../../shared/styles/workbench.css";
import { type Environment } from "../environments/EnvironmentManager";
import "../styles/operations.css";
import "../styles/studio.css";
import type { Message, Overview, Provider } from "./studio-types";

import { useStudioNavigation, type Tab } from "./navigation";
import { useStudioRequests } from "./requests";
import { useServerHealth } from "./useServerHealth";
export function useStudioController({
  onChanged,
  onExit,
}: {
  onChanged: () => Promise<void>;
  onExit: () => void;
}) {
  const { w } = useWorkbenchText();
  const { x } = useConnectedText();

  const { locale, setLocale, t, date } = useLocale();
  const serverReady = useServerHealth();
  const { tabLabel, nav } = useStudioNavigation();
  const [access, setAccess] = useState<string[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environment, setEnvironment] = useState("");
  const [token, setToken] = useState(
    () => sessionStorage.getItem("rac-user-token") ?? "",
  );
  const [workspace, setWorkspace] = useState(
    () =>
      new URLSearchParams(location.search).get("shop") ??
      sessionStorage.getItem("rac-user-workspace") ??
      "atelier",
  );
  useEffect(() => {
    if (token && !new URLSearchParams(location.search).has("shop"))
      history.replaceState(null, "", `?shop=${workspace}#merchant`);
  }, [token, workspace]);
  const [workspaceName, setWorkspaceName] = useState(workspace);
  const [connected, setConnected] = useState(false);
  const connectionScope = useRef("");
  const [role, setRole] = useState("viewer");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState("ollama");
  const [model, setModel] = useState("");
  const [conversations, setConversations] = useState<
    { id: string; title: string }[]
  >([]);
  const [id, setId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{
    key: "indexed" | "approvedAction" | "copied";
    count?: number;
  }>();
  const [settings, setSettings] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(() => {
    const target = new URLSearchParams(location.search).get("studio");
    return nav.find((item) => item.id === target)?.id ?? "assistant";
  });
  const [appSurface, setAppSurface] = useState<AppSurface | null>(null);
  const selectTab = (id: Tab) => {
    setAppSurface(null);
    setTab(id);
  };
  useEffect(() => setAppSurface(null), [workspace, environment, token]);
  const [data, setData] = useState<Overview>();
  const [focus, setFocus] = useState("lamp");
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("rac-studio-theme-v03") || "light",
  );
  const [updated, setUpdated] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const { liveRequest, request } = useStudioRequests(
    token,
    workspace,
    environment,
    locale,
  );
  useEffect(() => {
    if (token)
      void request("/api/auth/access")
        .then((v) => setAccess(v.permissions))
        .catch(() => setAccess([]));
  }, [token, request]);
  const refreshEnvironments = useCallback(
    async () =>
      setEnvironments((await liveRequest("/api/environments")).environments),
    [liveRequest],
  );
  useEffect(() => {
    setEnvironment("");
    setEnvironments([]);
  }, [workspace]);
  useEffect(() => {
    if (token) void refreshEnvironments().catch(() => {});
  }, [token, refreshEnvironments]);
  const refresh = useCallback(async () => {
    setData(await request("/api/merchant/overview"));
    setConversations((await request("/api/agent/conversations")).conversations);
    setUpdated(new Date().toISOString());
  }, [request]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    if (!token) {
      connectionScope.current = "";
      setConnected(false);
      return;
    }
    // Refresh translated context without unmounting open editors. Auth and
    // tenant/environment changes still require a newly verified connection.
    const scope = JSON.stringify([token, workspace, environment]);
    if (connectionScope.current !== scope) setConnected(false);
    connectionScope.current = scope;
    Promise.all([
      request("/api/agent/providers"),
      request("/api/merchant/overview"),
      request("/api/agent/conversations"),
      liveRequest("/api/auth/session"),
    ])
      .then(([providerData, overview, history, session]) => {
        if (!active) return;
        const ps: Provider[] = providerData.providers;
        setProviders(ps);
        setModel(ps.find((p) => p.id === provider)?.model ?? ps[0].model);
        setData(overview);
        setConversations(history.conversations);
        setWorkspaceName(
          session.workspaces.find(
            (w: { id: string; name: string }) => w.id === workspace,
          )?.name ?? workspace,
        );
        setRole(
          session.workspaces.find(
            (w: { id: string; role: string }) => w.id === workspace,
          )?.role ?? "viewer",
        );
        setUpdated(new Date().toISOString());
        setConnected(true);
        setError("");
      })
      .catch((e) => {
        if (active) {
          setConnected(false);
          setError(String(e));
          setData(undefined);
        }
      });
    return () => {
      active = false;
    };
  }, [request, token, workspace, environment]);
  useEffect(() => {
    if (tab === "assistant")
      bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy, tab]);
  useEffect(() => {
    localStorage.setItem("rac-studio-theme-v03", theme);
  }, [theme]);
  const connect = async () => {
    const ps: Provider[] = (await request("/api/agent/providers")).providers;
    setProviders(ps);
    setModel(ps.find((p) => p.id === provider)?.model || ps[0].model);
    await refresh();
    setConnected(true);
  };
  const load = async (conversationId: string) => {
    const value = await request(`/api/agent/conversations/${conversationId}`);
    setId(value.conversationId);
    setMessages(value.messages);
    selectTab("assistant");
    setMenu(false);
  };
  const newChat = () => {
    setId(undefined);
    setMessages([]);
    setDraft("");
    selectTab("assistant");
    setMenu(false);
    composer.current?.focus();
  };
  const intent = (text: string) => {
    selectTab("assistant");
    setDraft(text);
    setMenu(false);
    requestAnimationFrame(() => composer.current?.focus());
  };
  const send = async () => {
    if (!draft.trim() || busy || !connected) return;
    const text = draft;
    setPendingText(text);
    setDraft("");
    await run(async () => {
      try {
        const v = await request("/api/agent/chat", {
          message: text,
          conversationId: id,
          inference: { provider, model: model || undefined },
        });
        setId(v.conversationId);
        setMessages(v.messages);
        await refresh();
      } catch (e) {
        setDraft(text);
        throw e;
      } finally {
        setPendingText("");
      }
    });
  };
  const apply = async (m: Message) => {
    await request(`/api/agent/tasks/${m.data.taskId}/apply`, { approve: true });
    if (id) await load(id);
    await refresh();
    await onChanged();
    setNotice({ key: "approvedAction" });
  };
  const onProduct = (productId: string) => setFocus(productId);
  const selected =
    data?.products.find((p) => p.id === focus) || data?.products[0];

  return {
    onExit,
    onChanged,
    locale,
    setLocale,
    t,
    date,
    serverReady,
    tabLabel,
    nav,
    access,
    setAccess,
    environments,
    setEnvironments,
    environment,
    setEnvironment,
    token,
    setToken,
    workspace,
    setWorkspace,
    workspaceName,
    setWorkspaceName,
    connected,
    setConnected,
    role,
    setRole,
    providers,
    setProviders,
    provider,
    setProvider,
    model,
    setModel,
    conversations,
    setConversations,
    id,
    setId,
    messages,
    setMessages,
    draft,
    setDraft,
    pendingText,
    setPendingText,
    busy,
    setBusy,
    error,
    setError,
    notice,
    setNotice,
    settings,
    setSettings,
    previewOpen,
    setPreviewOpen,
    tab,
    setTab,
    appSurface,
    setAppSurface,
    selectTab,
    data,
    setData,
    focus,
    setFocus,
    menu,
    setMenu,
    theme,
    setTheme,
    updated,
    setUpdated,
    bottom,
    composer,
    liveRequest,
    request,
    refreshEnvironments,
    refresh,
    run,
    connect,
    load,
    newChat,
    intent,
    send,
    apply,
    onProduct,
    selected,
    w,
    x,
  };
}
export type StudioController = ReturnType<typeof useStudioController>;
