/** Evidence, hypotheses and explicit merchant decisions are read from the durable intelligence API. */
import { useEffect, useState } from "react";
import { useAppText } from "../../shared/i18n/app-i18n";
import type { RequestFn } from "../shell/studio-types";
type Memory = {
  pairs: {
    left: string;
    right: string;
    orders: number;
    simulatedOrders: number;
    lastEvent: number;
  }[];
  hypotheses: {
    id: string;
    state: string;
    revision: number;
    evidence: { left: string; right: string; observedOrders: number };
  }[];
};
export default function MemoryView({ request }: { request: RequestFn }) {
  const { a } = useAppText();
  const [data, setData] = useState<Memory>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    request("/api/intelligence")
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  const decide = async (h: Memory["hypotheses"][0], state: string) => {
    try {
      await request(
        `/api/intelligence/hypotheses/${h.id}`,
        { state, revision: h.revision, approve: true },
        "PUT",
      );
      setData(await request("/api/intelligence"));
      setNotice(state === "published" ? "published" : "marked");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="studio-card app-card">
      <h2>{a("observed")}</h2>
      <p>{a("evidenceHint")}</p>
      {!data?.pairs.length && <p>{a("noEvidence")}</p>}
      {data?.pairs.map((p) => (
        <article key={`${p.left}:${p.right}`}>
          <h3>
            {p.left} + {p.right}
          </h3>
          <p>
            {p.orders} {a("orders")} · {p.simulatedOrders} {a("simulated")}
          </p>
          <small>
            {a("source")}: {p.lastEvent}
          </small>
        </article>
      ))}
      {data?.hypotheses.map((h) => (
        <article className="app-hypothesis" key={h.id}>
          <strong>
            {a("hypothesis")}: {h.evidence.left} + {h.evidence.right} ·{" "}
            {a(h.state)}
          </strong>
          <div>
            <button
              className="studio-primary"
              onClick={() => void decide(h, "published")}
            >
              {a("publish")}
            </button>
            <button
              className="studio-secondary"
              onClick={() => void decide(h, "experiment")}
            >
              {a("investigate")}
            </button>
            <button
              className="studio-secondary"
              onClick={() => void decide(h, "dismissed")}
            >
              {a("dismiss")}
            </button>
          </div>
        </article>
      ))}
      {notice && <p role="status">{a(notice)}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
