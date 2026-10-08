/** Optional cart-private memory uses native consent, revisioned graph storage and explicit AI-sharing preference. */
import { useEffect, useState } from "react";
import { shopApi } from "../../shared/api/shop-api";
import { usePreferenceText } from "../../shared/i18n/preference-i18n";
import { openConsent, usePurpose } from "../../shared/legal/consent-store";
import { useLegalText } from "../../shared/i18n/legal-i18n";
type Node = {
  id: string;
  kind: string;
  value: string;
  productId?: string | null;
};
type Graph = {
  nodes: Node[];
  edges: { source: string; target: string; kind: string }[];
};
type Memory = { graph: Graph; revision: number; useForAdvice: boolean };
const empty = (): Memory => ({
  graph: { nodes: [], edges: [] },
  revision: 0,
  useForAdvice: false,
});
export default function ShoppingPreferences({ token }: { token?: string }) {
  const t = usePreferenceText(),
    { l } = useLegalText(),
    allowed = usePurpose("personalization");
  const [memory, setMemory] = useState<Memory>(empty),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    setFeedback("");
    if (!allowed || !token) {
      setMemory(empty());
      return;
    }
    shopApi<Memory>("/store-api/intelligence/preferences", undefined, token)
      .then((value) => {
        if (active) setMemory({ ...empty(), ...value });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [allowed, token]);
  const run = async (fn: () => Promise<void>) => {
    if (busy || !token) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const value = (kind: string) =>
    memory.graph.nodes.find((n) => n.kind === kind)?.value ?? "";
  const change = (kind: string, text: string) => {
    const existing = memory.graph.nodes.find((n) => n.kind === kind),
      id = existing?.id ?? crypto.randomUUID();
    const nodes = memory.graph.nodes.filter((n) => n.id !== id);
    if (text.trim()) nodes.push({ id, kind, value: text });
    setMemory({
      ...memory,
      graph: {
        nodes,
        edges: memory.graph.edges.filter(
          (e) =>
            nodes.some((n) => n.id === e.source) &&
            nodes.some((n) => n.id === e.target),
        ),
      },
    });
  };
  return (
    <section className="account-preferences">
      <h2>{t("title")}</h2>
      <p className="account-muted">{t("scope")}</p>
      {error && (
        <p role="alert" className="account-feedback is-error">
          {error}
        </p>
      )}
      {feedback && (
        <p role="status" className="account-feedback">
          {feedback}
        </p>
      )}
      {!allowed && (
        <button className="shop-secondary" onClick={openConsent}>
          {l("consent")}
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const result = await shopApi<{ revision: number }>(
              "/store-api/intelligence/preferences",
              memory,
              token,
              "PUT",
            );
            setMemory({ ...memory, revision: result.revision });
            setFeedback(t("saved"));
          });
        }}
      >
        <fieldset disabled={busy || !allowed || !token}>
          <div className="customer-field-grid">
            {(["size", "style"] as const).map((kind) => (
              <label key={kind}>
                {t(kind)}
                <input
                  maxLength={240}
                  value={value(kind)}
                  onChange={(e) => change(kind, e.target.value)}
                />
              </label>
            ))}
          </div>
          <label className="account-preference-toggle">
            <input
              type="checkbox"
              checked={memory.useForAdvice}
              onChange={(e) =>
                setMemory({ ...memory, useForAdvice: e.target.checked })
              }
            />
            {t("share")}
          </label>
          <button className="shop-primary">{t("save")}</button>
        </fieldset>
      </form>
      <div className="account-actions">
        <button
          className="shop-secondary"
          disabled={busy || !allowed || !token}
          onClick={() =>
            void run(async () => {
              const current = await shopApi<Memory>(
                "/store-api/intelligence/preferences",
                undefined,
                token,
              );
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(current, null, 2)], {
                  type: "application/json",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "vendune-preferences.json";
              link.click();
              URL.revokeObjectURL(url);
            })
          }
        >
          {t("export")}
        </button>
        <button
          className="shop-secondary"
          disabled={busy || !token}
          onClick={() =>
            void run(async () => {
              await shopApi(
                "/store-api/intelligence/preferences",
                undefined,
                token,
                "DELETE",
              );
              setMemory(empty());
              setFeedback(t("erased"));
            })
          }
        >
          {t("remove")}
        </button>
      </div>
    </section>
  );
}
