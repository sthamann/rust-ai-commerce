/** Real infrastructure probes, bounded lifetime traffic and process-local resource counters. */
import { useEffect, useState } from "react";
import { useControlText } from "../shared/i18n/control-i18n";
import { usePlatformText } from "../shared/i18n/platform-i18n";
import {
  platformRequest as request,
  type Infrastructure,
  type Traffic,
} from "./platform-api";
export function TrafficTable({ rows }: { rows: Traffic[] }) {
  const c = useControlText(),
    t = usePlatformText();
  return (
    <div className="platform-table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t("channels")}</th>
            <th>{c("calls")}</th>
            <th>{t("failures")}</th>
            <th>{c("latency")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.channel}>
              <td>{r.channel}</td>
              <td>{r.calls.toLocaleString()}</td>
              <td>{r.failures}</td>
              <td>
                {r.timedCalls
                  ? `${(r.totalMs / r.timedCalls).toFixed(1)} / ${r.maxMs} ms`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default function PlatformInfrastructure({ token }: { token: string }) {
  const c = useControlText(),
    t = usePlatformText();
  const [data, setData] = useState<Infrastructure>(),
    [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setError(false);
    request<Infrastructure>(token, "/api/platform/infrastructure")
      .then((v) => {
        if (live) setData(v);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [token]);
  return (
    <>
      <p className="platform-note">{c("metricsHint")}</p>
      {error && <p role="alert">{t("retry")}</p>}
      {!data ? (
        <p>{t("loading")}</p>
      ) : (
        <>
          <div className="platform-provider-grid">
            <section className="platform-panel">
              <h2>{c("database")}</h2>
              <p>{c("databaseHint")}</p>
              <span className="platform-status active">{c("healthy")}</span>
              <dl>
                <dt>{c("probe")}</dt>
                <dd>{`${data.database.probeMs} ms`}</dd>
                <dt>{c("size")}</dt>
                <dd>{`${(data.database.bytes / 1024 / 1024).toFixed(1)} MB`}</dd>
                <dt>{c("connections")}</dt>
                <dd>
                  {data.process.poolConnections} / {data.process.poolIdle}
                </dd>
              </dl>
              <small>{data.database.version}</small>
            </section>
            <section className="platform-panel">
              <h2>{c("vectors")}</h2>
              <p>{c("vectorsHint")}</p>
              <span className="platform-status">
                {c(data.qdrant.healthy ? "healthy" : "unavailable")}
              </span>
              <dl>
                <dt>{c("probe")}</dt>
                <dd>{`${data.qdrant.probeMs} ms`}</dd>
              </dl>
            </section>
            <section className="platform-panel">
              <h2>{c("runtime")}</h2>
              <p>{c("runtimeHint")}</p>
              <dl>
                <dt>{c("cpu")}</dt>
                <dd>
                  {data.resources.containerCpuPercent === null
                    ? "—"
                    : `${data.resources.containerCpuPercent.toFixed(1)} %`}
                </dd>
                <dt>{c("memory")}</dt>
                <dd>
                  {data.resources.containerMemoryBytes === null
                    ? "—"
                    : `${(data.resources.containerMemoryBytes / 1024 / 1024).toFixed(1)} MB`}{" "}
                  /{" "}
                  {data.resources.containerMemoryLimitBytes === null
                    ? "—"
                    : `${(data.resources.containerMemoryLimitBytes / 1024 / 1024).toFixed(1)} MB`}
                </dd>
                <dt>{c("processMemory")}</dt>
                <dd>
                  {data.resources.processResidentBytes === null
                    ? "—"
                    : `${(data.resources.processResidentBytes / 1024 / 1024).toFixed(1)} MB`}
                </dd>
                <dt>{t("events")}</dt>
                <dd>{data.pendingEvents}</dd>
                <dt>{c("cache")}</dt>
                <dd>
                  {data.process.readCache.decodedHits} /{" "}
                  {data.process.readCache.payloadLoads}
                </dd>
              </dl>
            </section>
          </div>
          <section className="platform-panel">
            <h2>{t("traffic")}</h2>
            <TrafficTable rows={data.channels} />
            <p className="platform-note">{c("resourceHint")}</p>
          </section>
        </>
      )}
    </>
  );
}
