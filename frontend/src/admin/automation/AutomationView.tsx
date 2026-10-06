/** Typed merchant rule/campaign/flow/channel forms with exact JSON available for advanced review. */
import AutomationDefinitions from "./AutomationDefinitions";
import AutomationDelete from "./AutomationDelete";
import { useLifecycleText } from "./lifecycle-i18n";
import "../styles/automation-lifecycle.css";
import EntityHistory from "../../shared/history/EntityHistory";
import { ContentLanguage } from "../../shared/i18n/ContentLanguage";
import "../styles/international.css";
import FlowExecution from "./FlowExecution";
import { useConnectedText } from "../../shared/i18n/connected-i18n";
import { type Config, type Kind } from "./automation-types";
import AutomationEditor from "./AutomationEditor";
import { type AutomationCatalog } from "./RuleBuilder";

import { useEffect, useState } from "react";

import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import ProposalCard from "../assistant/ProposalCard";
import type { Message, RequestFn } from "../shell/studio-types";
export default function AutomationView({
  request,
  role,
  onChannels,
}: {
  request: RequestFn;
  role: string;
  onChannels?: () => void;
}) {
  const t = useLifecycleText();
  const { x } = useConnectedText();
  const [languages, setLanguages] = useState<{
    locales: string[];
    mainLocale: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    request("/api/merchant/commerce")
      .then((v) => {
        if (active) setLanguages(v.data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  const [contentLanguage, setContentLanguage] = useState("");
  const [imported, setImported] = useState("");
  const { w, locale } = useWorkbenchText();
  const [catalog, setCatalog] = useState<AutomationCatalog>({
    conditions: [
      "andContainer",
      "orContainer",
      "notContainer",
      "alwaysValid",
      "cartCartAmount",
      "cartLineItemCount",
      "customerGroup",
      "shippingCountry",
      "salesChannel",
      "lineItemId",
      "customerLoggedIn",
      "orderState",
      "paymentState",
      "deliveryState",
      "contextField",
      "eventField",
    ],
    fields: [],
    events: ["order.placed"],
    apps: [],
  });
  useEffect(() => {
    request("/api/automation/catalog")
      .then(setCatalog)
      .catch(() => {});
  }, [request]);
  const [kind, setKind] = useState<Kind>("rules");
  const [rows, setRows] = useState<Record<Kind, Config[]>>({
    rules: [],
    promotions: [],
    flows: [],
    channels: [],
  });
  const [jobs, setJobs] = useState<any[]>([]);
  const [id, setId] = useState("");
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Record<string, any>>({
    name: {},
    active: true,
    condition: { type: "cartCartAmount", operator: ">=", amount: 100 },
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState("");
  const [manage, setManage] = useState(false);
  useEffect(() => {
    request("/api/auth/access")
      .then((v) => setManage(v.permissions.includes("settings.write")))
      .catch(() => setManage(false));
  }, [request]);
  const choose = (r: Config, k: Kind = kind) => {
    setKind(k);
    setId(r.id);
    setRevision(r.revision);
    setData(r.data);
    setAdvanced("");
    setError("");
  };
  const load = async () => {
    const v = await request("/api/automation");
    setRows(v);
    setJobs(v.jobs);
    setCatalog((c) => ({
      ...c,
      rules: v.rules.map((r: Config) => ({
        id: r.id,
        name: r.data.name,
        revision: r.revision,
      })),
    }));
  };
  useEffect(() => {
    let active = true;
    request("/api/automation")
      .then((v) => {
        if (active) {
          setRows(v);
          setJobs(v.jobs);
          if (v.rules[0]) choose(v.rules[0], "rules");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  useEffect(() => {
    let active = true;
    const timer = window.setInterval(() => {
      request("/api/automation/executions")
        .then((v) => {
          if (active) setJobs(v.jobs);
        })
        .catch(() => {});
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [request]);
  const fresh = (k: Kind) => {
    setKind(k);
    setContentLanguage(languages?.mainLocale ?? "en-GB");
    setId("");
    setRevision(0);
    setAdvanced("");
    const common = { name: {}, active: true };
    setData(
      k === "rules"
        ? {
            ...common,
            condition: { type: "cartCartAmount", operator: ">=", amount: 100 },
          }
        : k === "promotions"
          ? {
              ...common,
              code: null,
              kind: "percentage",
              amount: 10,
              rule: { type: "alwaysValid" },
              exclusive: false,
              priority: 0,
              maxUses: null,
              start: null,
              end: null,
            }
          : k === "flows"
            ? {
                ...common,
                event: "order.placed",
                condition: { type: "alwaysValid" },
                action: "note",
                instruction: {},
                locale: languages?.mainLocale ?? "en-GB",
                inference: { provider: "ollama" },
              }
            : {
                ...common,
                kind: "storefront",
                locales: languages?.locales ?? ["en-GB"],
                productIds: [],
              },
    );
  };
  const update = (key: string, value: unknown) => {
    setAdvanced("");
    setData((d) => ({ ...d, [key]: value }));
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ContentLanguage
      key={
        languages
          ? `${languages.mainLocale}:${languages.locales.join(",")}`
          : "loading"
      }
      locales={languages?.locales ?? ["en-GB"]}
      mainLocale={languages?.mainLocale ?? "en-GB"}
      language={contentLanguage || languages?.mainLocale}
      onLanguageChange={setContentLanguage}
    >
      <div className="studio-page workbench">
        <div className="page-intro">
          <span className="kicker">{w("automation")}</span>
          <h1>{w("automation")}</h1>
          <p>{w("automationHint")}</p>
        </div>
        <nav className="workbench-row">
          {(["rules", "promotions", "flows", "channels"] as Kind[]).map((k) => (
            <button
              key={k}
              className={kind === k ? "studio-primary" : "studio-secondary"}
              onClick={() =>
                k === "channels" && onChannels
                  ? onChannels()
                  : rows[k][0]
                    ? choose(rows[k][0], k)
                    : fresh(k)
              }
            >
              {w(k)}
            </button>
          ))}
        </nav>
        <aside className="automation-process-guide">
          <h2>{t("processes")}</h2>
          <p>{t("processHint")}</p>
          <p className="muted">{t("coreHint")}</p>
        </aside>
        <div
          className={`workbench-grid ${kind === "flows" ? "flow-workspace" : ""}`}
        >
          <AutomationDefinitions
            rows={rows[kind]}
            id={id}
            mainLocale={languages?.mainLocale ?? "en-GB"}
            manage={manage}
            onCreate={() => fresh(kind)}
            onSelect={(r) => choose(r)}
          />
          <section className="studio-card">
            <AutomationEditor
              run={run}
              request={request}
              kind={kind}
              id={id}
              advanced={advanced}
              data={data}
              setRevision={setRevision}
              w={w}
              setId={setId}
              revision={revision}
              update={update}
              x={x}
              imported={imported}
              setImported={setImported}
              busy={busy || !languages}
              manage={manage}
              catalog={catalog}
              rows={rows}
              locale={locale}
              setAdvanced={setAdvanced}
            />
            <AutomationDelete
              key={`${kind}:${id}`}
              request={request}
              kind={kind}
              id={id}
              revision={revision}
              disabled={
                !manage ||
                busy ||
                JSON.stringify(data) !==
                  JSON.stringify(rows[kind].find((r) => r.id === id)?.data)
              }
              onReference={(k, i) => {
                const r = rows[k].find((r) => r.id === i);
                if (r) choose(r, k);
              }}
              onDeleted={async () => {
                await load();
                fresh(kind);
              }}
            />
            {!!id && revision > 0 && (
              <EntityHistory
                request={request}
                entity={
                  {
                    rules: "rule",
                    flows: "flow",
                    promotions: "promotion",
                    channels: "channel",
                  }[kind]
                }
                id={id}
                revision={revision}
                dirty={
                  busy ||
                  JSON.stringify(data) !==
                    JSON.stringify(rows[kind].find((r) => r.id === id)?.data)
                }
                onRestored={async () => {
                  const next = await request("/api/automation");
                  setRows(next);
                  setJobs(next.jobs);
                  const record = next[kind].find((r: Config) => r.id === id);
                  if (record) {
                    setData(record.data);
                    setRevision(record.revision);
                    setAdvanced("");
                  }
                }}
              />
            )}
          </section>
        </div>
        {error && <p role="alert">{error}</p>}
        <section className="studio-card">
          <h2>{w("executions")}</h2>
          {jobs.map((j) => (
            <article key={j.id}>
              <strong>{j.flow}</strong>
              <p>
                {w(
                  [
                    "queued",
                    "running",
                    "completed",
                    "failed",
                    "uncertain",
                  ].includes(j.state)
                    ? (j.state as "queued")
                    : "failed",
                )}
              </p>
              {j.result?.note && <p>{j.result.note}</p>}
              <FlowExecution job={j} />
              {j.result?.preview && (
                <ProposalCard
                  message={
                    {
                      id: 0,
                      role: "assistant",
                      content: "",
                      applied: !!j.applied,
                      data: {
                        taskId: j.result.taskId,
                        preview: j.result.preview,
                      },
                    } as Message
                  }
                  canApply={role !== "viewer"}
                  busy={busy}
                  onApply={() =>
                    void run(async () => {
                      await request(
                        `/api/agent/tasks/${j.result.taskId}/apply`,
                        {
                          approve: true,
                        },
                      );
                    })
                  }
                />
              )}{" "}
              {j.error && <p>{j.error}</p>}
            </article>
          ))}
        </section>
        <p className="muted">{w("nativeSubset")}</p>
      </div>
    </ContentLanguage>
  );
}
