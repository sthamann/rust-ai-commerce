/** Immutable experiment designs and lifecycle controls share the core HTTP/MCP owner and current settings rights. */
import { useEffect, useState } from "react";
import type { Config } from "../../shared/api/shop-api";
import type { RequestFn } from "../shell/studio-types";
import { useKnowledgeText } from "../../shared/i18n/knowledge-i18n";
import { useLocale } from "../../shared/i18n/i18n";
import { useStudio } from "../shell/StudioContext";
type Design = {
  title: string;
  locale: string;
  channel: string;
  currency: string;
  control: string;
  treatment: string;
  durationHours: number;
  settlementDays: number;
  minimumPerArm: number;
  outcomeCapMinor: number;
  cupedTheta: number;
};
type Experiment = {
  id: string;
  design: Design;
  revision: number;
  state: string;
  endsAt?: string;
};
type Readout = {
  causalUpliftProven: boolean;
  unitsPerArm: number[];
  netCollectedMinor: string;
  currency: string;
  interval95?: number[] | null;
};
export default function ExperimentStudio({ request }: { request: RequestFn }) {
  const k = useKnowledgeText(),
    { locale, date } = useLocale(),
    { access } = useStudio();
  const [rows, setRows] = useState<Experiment[]>([]),
    [channels, setChannels] = useState<{ id: string }[]>([]),
    [currencies, setCurrencies] = useState<string[]>([]);
  const [draft, setDraft] = useState<Design>({
    title: "",
    locale,
    channel: "",
    currency: "",
    control: "discovery",
    treatment: "comparison",
    durationHours: 168,
    settlementDays: 30,
    minimumPerArm: 500,
    outcomeCapMinor: 10000,
    cupedTheta: 0,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reports, setReports] = useState<Record<string, Readout>>({});
  const canWrite = access.includes("settings.write");
  const refresh = async () =>
    setRows(
      (await request("/api/intelligence/experiments", {}, "POST")).experiments,
    );
  useEffect(() => {
    let active = true;
    Promise.all([
      request("/api/intelligence/experiments", {}, "POST"),
      request("/api/automation"),
      request("/api/merchant/commerce"),
    ])
      .then(([result, automation, settings]) => {
        if (!active) return;
        setRows(result.experiments);
        setChannels(automation.channels);
        const config = settings.data as Config;
        if (!config.currencies) throw new Error(k("experimentUnavailable"));
        const currencies = config.currencies;
        setCurrencies(currencies.enabled);
        setDraft((d) => ({
          ...d,
          channel: automation.channels[0]?.id ?? "",
          currency: currencies.defaultCurrency,
        }));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const transition = (row: Experiment, operation: string) =>
    run(async () => {
      await request(
        `/api/intelligence/experiment.${operation}`,
        { id: row.id, revision: row.revision, approve: true },
        "POST",
      );
      await refresh();
    });
  const stateWord = {
    draft: "experimentDraft",
    running: "experimentRunning",
    stopped: "experimentStopped",
    completed: "experimentCompleted",
  } as const;
  const fields = [
    ["durationHours", "experimentHours", 1, 720],
    ["settlementDays", "experimentDelay", 14, 90],
    ["minimumPerArm", "experimentMinimum", 100, 5000],
    ["outcomeCapMinor", "experimentCap", 1, 1000000000000],
    ["cupedTheta", "experimentTheta", 0, 1],
  ] as const;
  return (
    <section className="knowledge-panel experiment-studio">
      <h2>{k("experiments")}</h2>
      <p>{k("experimentIntro")}</p>
      <p className="muted">{k("experimentBoundary")}</p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await request(
              "/api/intelligence/experiment.create",
              {
                design: {
                  ...draft,
                  locale,
                  treatment:
                    draft.control === "discovery" ? "comparison" : "discovery",
                },
                approve: true,
              },
              "POST",
            );
            await refresh();
          });
        }}
      >
        <fieldset disabled={busy || !canWrite} className="studio-form-grid">
          <label>
            {k("experimentTitle")}
            <input
              required
              maxLength={240}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            {k("experimentChannel")}
            <select
              required
              value={draft.channel}
              onChange={(e) => setDraft({ ...draft, channel: e.target.value })}
            >
              {channels.map((c) => (
                <option key={c.id}>{c.id}</option>
              ))}
            </select>
          </label>
          <label>
            {k("experimentCurrency")}
            <select
              required
              value={draft.currency}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
            >
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            {k("experimentControl")}
            <select
              value={draft.control}
              onChange={(e) => setDraft({ ...draft, control: e.target.value })}
            >
              <option value="discovery">{k("experimentDiscovery")}</option>
              <option value="comparison">{k("experimentComparison")}</option>
            </select>
          </label>
          {fields.map(([field, word, min, max]) => (
            <label key={field}>
              {k(word)}
              <input
                required
                type="number"
                min={min}
                max={max}
                step={field === "cupedTheta" ? "0.01" : "1"}
                value={draft[field]}
                onChange={(e) =>
                  setDraft({ ...draft, [field]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <button
            className="studio-primary"
            disabled={!draft.channel || !draft.currency}
          >
            {k("registerExperiment")}
          </button>
        </fieldset>
      </form>
      <button
        className="studio-secondary"
        disabled={busy}
        onClick={() => void run(refresh)}
      >
        {k("experimentRecheck")}
      </button>
      {!rows.length && <p>{k("experimentEmpty")}</p>}
      {rows.map((row) => (
        <article className="knowledge-source-card" key={row.id}>
          <header>
            <h3>{row.design.title}</h3>
            <span>
              {k(
                stateWord[row.state as keyof typeof stateWord] ??
                  "experimentDraft",
              )}
            </span>
          </header>
          <p>
            {row.design.channel} · {row.design.currency} ·{" "}
            {k("experimentDuration")
              .replace("{hours}", String(row.design.durationHours))
              .replace("{days}", String(row.design.settlementDays))}
          </p>
          {row.endsAt && (
            <p>
              {k("experimentEnds")}: {date(row.endsAt)}
            </p>
          )}
          <div className="studio-actions">
            {row.state === "draft" && (
              <button
                disabled={busy || !canWrite}
                onClick={() => void transition(row, "start")}
              >
                {k("experimentStart")}
              </button>
            )}
            {row.state === "running" && (
              <>
                <button
                  disabled={
                    busy ||
                    !canWrite ||
                    !row.endsAt ||
                    Date.parse(row.endsAt) > Date.now()
                  }
                  onClick={() => void transition(row, "finish")}
                >
                  {k("experimentFinish")}
                </button>
                <button
                  className="studio-danger"
                  disabled={busy || !canWrite}
                  onClick={() => void transition(row, "stop")}
                >
                  {k("experimentStop")}
                </button>
              </>
            )}
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await request(
                    "/api/intelligence/experiment.report",
                    { id: row.id },
                    "POST",
                  );
                  setReports((previous) => ({ ...previous, [row.id]: result }));
                })
              }
            >
              {k("experimentReadout")}
            </button>
          </div>
          {reports[row.id] && (
            <div role="status">
              <strong>
                {k(
                  reports[row.id].causalUpliftProven
                    ? "experimentPositive"
                    : "experimentPending",
                )}
              </strong>
              <p>
                {k("experimentUnits")}:{" "}
                {reports[row.id].unitsPerArm.join(" / ")}
              </p>
              <p>
                {k("experimentNet")}: {reports[row.id].netCollectedMinor}{" "}
                {reports[row.id].currency}
              </p>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
