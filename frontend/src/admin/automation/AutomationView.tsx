/** Typed merchant rule/campaign/flow/channel forms with exact JSON available for advanced review. */
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
}: {
  request: RequestFn;
  role: string;
}) {
  const { x } = useConnectedText();
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
    name: { en: "", de: "", fr: "", es: "" },
    active: true,
    condition: { type: "cartCartAmount", operator: ">=", amount: 100 },
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState("");
  const manage = ["owner", "admin"].includes(role);
  const load = async () => {
    const v = await request("/api/automation");
    setRows(v);
    setJobs(v.jobs);
  };
  useEffect(() => {
    let active = true;
    request("/api/automation")
      .then((v) => {
        if (active) {
          setRows(v);
          setJobs(v.jobs);
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
    setId("");
    setRevision(0);
    setAdvanced("");
    const common = { name: { en: "", de: "", fr: "", es: "" }, active: true };
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
                instruction: { en: "", de: "", fr: "", es: "" },
                locale,
                inference: { provider: "ollama" },
              }
            : {
                ...common,
                kind: "storefront",
                locales: ["de-DE", "en-GB", "fr-FR", "es-ES"],
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
            onClick={() => fresh(k)}
          >
            {w(k)}
          </button>
        ))}
      </nav>
      <div className="workbench-grid">
        <section className="studio-card">
          <h2>{w(kind)}</h2>
          {rows[kind].map((r) => (
            <button
              key={r.id}
              className="search-hit"
              onClick={() => {
                setId(r.id);
                setRevision(r.revision);
                setData(r.data);
                setAdvanced("");
              }}
            >
              {r.data.name[locale.slice(0, 2)] ?? r.id}
              <small>v{r.revision}</small>
            </button>
          ))}
          <button className="studio-secondary" onClick={() => fresh(kind)}>
            {w("newConfig")}
          </button>
        </section>
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
            busy={busy}
            manage={manage}
            catalog={catalog}
            rows={rows}
            locale={locale}
            setAdvanced={setAdvanced}
          />
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
                    await request(`/api/agent/tasks/${j.result.taskId}/apply`, {
                      approve: true,
                    });
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
  );
}
