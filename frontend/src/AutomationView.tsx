/** Typed merchant rule/campaign/flow/channel forms with exact JSON available for advanced review. */
import { useEffect, useState } from "react";
import { useOperationsText } from "./operations-i18n";
import { useWorkbenchText } from "./workbench-i18n";
import type { RequestFn, Message } from "./studio-types";
import ProposalCard from "./ProposalCard";
type Kind = "rules" | "promotions" | "flows" | "channels";
type Config = { id: string; revision: number; data: Record<string, any> };
const langs = ["en", "de", "fr", "es"] as const;
export default function AutomationView({
  request,
  role,
}: {
  request: RequestFn;
  role: string;
}) {
  const { w, locale } = useWorkbenchText();
  const { o } = useOperationsText();
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const result = await request(
                  `/api/automation/${kind}/${id}`,
                  {
                    revision,
                    data: advanced.trim() ? JSON.parse(advanced) : data,
                  },
                  "PUT",
                );
                setRevision(result.revision);
              });
            }}
          >
            <label>
              {w("identifier")}
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                required
                pattern="[a-z][a-z0-9_]{0,31}"
                disabled={revision > 0}
              />
            </label>
            <div className="workbench-row">
              {langs.map((lang) => (
                <label key={lang}>
                  {w("title")} · {lang.toUpperCase()}
                  <input
                    required
                    value={data.name?.[lang] ?? ""}
                    onChange={(e) =>
                      update("name", { ...data.name, [lang]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={data.active}
                onChange={(e) => update("active", e.target.checked)}
              />
              {w("enabled")}
            </label>
            {kind === "rules" && (
              <>
                <label>
                  {w("condition")}
                  <select
                    value={data.condition.type}
                    onChange={(e) =>
                      update(
                        "condition",
                        e.target.value === "cartCartAmount"
                          ? {
                              type: e.target.value,
                              operator: ">=",
                              amount: 100,
                            }
                          : e.target.value === "customerGroup"
                            ? { type: e.target.value, values: ["consumer"] }
                            : { type: e.target.value },
                      )
                    }
                  >
                    <option value="cartCartAmount">{w("cartAmount")}</option>
                    <option value="customerGroup">{w("customerGroup")}</option>
                    <option value="customerLoggedIn">{w("loggedIn")}</option>
                    <option value="alwaysValid">{w("always")}</option>
                  </select>
                </label>
                {data.condition.type === "cartCartAmount" && (
                  <label>
                    {w("threshold")}
                    <input
                      type="number"
                      min={0}
                      step=".01"
                      value={data.condition.amount}
                      onChange={(e) =>
                        update("condition", {
                          ...data.condition,
                          amount: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                )}
                {data.condition.type === "customerGroup" && (
                  <select
                    aria-label={w("customerGroup")}
                    value={data.condition.values[0]}
                    onChange={(e) =>
                      update("condition", {
                        type: "customerGroup",
                        values: [e.target.value],
                      })
                    }
                  >
                    <option value="consumer">{w("consumer")}</option>
                    <option value="business">B2B</option>
                  </select>
                )}
              </>
            )}
            {kind === "promotions" && (
              <>
                <label>
                  {w("coupon")}
                  <input
                    value={data.code ?? ""}
                    placeholder={w("automatic")}
                    onChange={(e) => update("code", e.target.value || null)}
                  />
                </label>
                <label>
                  {w("discountType")}
                  <select
                    value={data.kind}
                    onChange={(e) => update("kind", e.target.value)}
                  >
                    <option value="percentage">{w("percentage")}</option>
                    <option value="absolute">{w("absolute")}</option>
                    <option value="free_shipping">{w("shippingFree")}</option>
                  </select>
                </label>
                <label>
                  {w("amount")}
                  <input
                    type="number"
                    min={0}
                    step=".01"
                    value={data.amount}
                    onChange={(e) => update("amount", Number(e.target.value))}
                  />
                </label>
                <label>
                  {w("maxUses")}
                  <input
                    type="number"
                    min={1}
                    value={data.maxUses ?? ""}
                    onChange={(e) =>
                      update(
                        "maxUses",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </label>
              </>
            )}
            {(kind === "promotions" || kind === "flows") && (
              <label>
                {w("condition")}
                <select
                  value=""
                  onChange={(e) =>
                    update(
                      kind === "promotions" ? "rule" : "condition",
                      rows.rules.find((r) => r.id === e.target.value)?.data
                        .condition ?? { type: "alwaysValid" },
                    )
                  }
                >
                  <option value="">{w("chooseRule")}</option>
                  {rows.rules.map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.data.name[locale.slice(0, 2)]}
                    </option>
                  ))}
                </select>
                <small>
                  {(kind === "promotions" ? data.rule : data.condition).type}
                </small>
              </label>
            )}
            {kind === "flows" && (
              <>
                <label>
                  {w("trigger")}
                  <select
                    value={data.event}
                    onChange={(e) => update("event", e.target.value)}
                  >
                    <option value="order.placed">{w("orderPlaced")}</option>
                    {[
                      "order.state_changed",
                      "payment.state_changed",
                      "delivery.state_changed",
                      "payment.updated",
                    ].map((event) => (
                      <option key={event} value={event}>
                        {o(event)}
                      </option>
                    ))}
                    <option value="payment.captured">
                      {w("paymentCaptured")}
                    </option>
                  </select>
                </label>
                <label>
                  {w("action")}
                  <select
                    value={data.action}
                    onChange={(e) => update("action", e.target.value)}
                  >
                    <option value="note">{w("note")}</option>
                    <option value="ai_proposal">{w("aiProposal")}</option>
                  </select>
                </label>
                {langs.map((lang) => (
                  <label key={lang}>
                    {w("instruction")} · {lang}
                    <textarea
                      value={data.instruction?.[lang] ?? ""}
                      onChange={(e) =>
                        update("instruction", {
                          ...data.instruction,
                          [lang]: e.target.value,
                        })
                      }
                      maxLength={4000}
                    />
                  </label>
                ))}
                {data.action === "ai_proposal" && (
                  <label>
                    {w("provider")}
                    <select
                      value={data.inference?.provider ?? "ollama"}
                      onChange={(e) =>
                        update("inference", { provider: e.target.value })
                      }
                    >
                      <option value="ollama">{w("localModel")}</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Claude</option>
                    </select>
                  </label>
                )}
              </>
            )}
            {kind === "channels" && (
              <>
                <label>
                  {w("channelType")}
                  <select
                    value={data.kind}
                    onChange={(e) => update("kind", e.target.value)}
                  >
                    <option value="storefront">{w("storefrontType")}</option>
                    <option value="headless">Headless</option>
                  </select>
                </label>
                <label>
                  {w("product")}
                  <input
                    value={data.productIds.join(", ")}
                    onChange={(e) =>
                      update(
                        "productIds",
                        e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </label>
                <a
                  href={`/?shop=${new URLSearchParams(location.search).get("shop") ?? "atelier"}&channel=${id}#`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {w("preview")} ↗
                </a>
              </>
            )}
            <details>
              <summary>{w("details")}</summary>
              <textarea
                rows={12}
                value={advanced || JSON.stringify(data, null, 2)}
                onChange={(e) => setAdvanced(e.target.value)}
              />
            </details>
            <button className="studio-primary" disabled={busy || !manage}>
              {w("save")}
            </button>
          </form>
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
