/** Optional image-provider jobs create private previews; applying a reviewed image is explicit and revision checked. */
import { useEffect, useRef, useState } from "react";
import { useWorkspaceText } from "../../shared/i18n/workspace-i18n";
import type { RequestFn } from "../shell/studio-types";
import type { GalleryImage } from "./media-model";
export default function AiImageStudio({
  productId,
  revision,
  sourceId,
  request,
  onImage,
  disabled,
}: {
  productId: string;
  revision: number;
  sourceId?: string;
  request: RequestFn;
  onImage: (m: GalleryImage) => void;
  disabled: boolean;
}) {
  const { w } = useWorkspaceText();
  const [configured, setConfigured] = useState(false),
    [prompt, setPrompt] = useState(""),
    [job, setJob] = useState<any>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = useRef(request);
  current.current = request;
  useEffect(() => {
    let active = true;
    current
      .current("/api/merchant/media/provider")
      .then((v) => {
        if (active) setConfigured(v.configured);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setJob(undefined);
    current
      .current(`/api/merchant/products/${productId}/media/jobs`)
      .then(async (v) => {
        const latest = v.jobs?.[0];
        if (latest) {
          const detail = await current.current(
            `/api/merchant/media/jobs/${latest.id}`,
          );
          if (active) setJob(detail);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [productId]);
  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.state)) return;
    let active = true;
    const timer = setInterval(() => {
      current
        .current(`/api/merchant/media/jobs/${job.id}`)
        .then((v) => {
          if (active) {
            setJob(v);
            if (v.state === "failed") setError(w("imageFailed"));
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [job?.id, job?.state]);
  const start = async (mode: string) => {
    setBusy(true);
    setError("");
    try {
      setJob(
        await request(`/api/merchant/products/${productId}/media/jobs`, {
          prompt,
          mode,
          sourceId: mode === "optimize" ? sourceId : null,
          revision,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const waiting = job && ["queued", "processing"].includes(job.state);
  return (
    <details className="media-ai-studio">
      <summary>✦ {w("aiImages")}</summary>
      <p>{w(configured ? "aiHint" : "aiDisabled")}</p>
      {configured && disabled && <p>{w("saveBeforeImage")}</p>}
      <label>
        {w("prompt")}
        <textarea
          value={prompt}
          maxLength={2000}
          rows={3}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={!configured || busy || waiting || disabled}
        />
      </label>
      <div className="media-actions">
        <button
          type="button"
          className="studio-primary"
          disabled={
            !configured || busy || waiting || disabled || !prompt.trim()
          }
          onClick={() => void start("generate")}
        >
          {w("generate")}
        </button>
        <button
          type="button"
          className="studio-secondary"
          disabled={
            !configured ||
            !sourceId ||
            busy ||
            waiting ||
            disabled ||
            !prompt.trim()
          }
          onClick={() => void start("optimize")}
        >
          {w("optimize")}
        </button>
      </div>
      {waiting && <p role="status">{w("generating")}</p>}
      {error && <p role="alert">{error}</p>}
      {job?.state === "ready" && (
        <div className="media-ai-preview">
          <img src={job.preview} alt={w("aiImages")} />
          <button
            type="button"
            className="studio-primary"
            disabled={busy || disabled}
            onClick={async () => {
              setBusy(true);
              try {
                const v = await request(
                  `/api/merchant/media/jobs/${job.id}/apply`,
                  { revision },
                );
                onImage(v);
                setJob(undefined);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {w("applyImage")}
          </button>
        </div>
      )}
    </details>
  );
}
