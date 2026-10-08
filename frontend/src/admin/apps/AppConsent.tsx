/** Review the actual package and permission changes before installation; consent is enforced by the API. */
import { useEffect, useState } from "react";
import type { RequestFn } from "../shell/studio-types";
import ConfirmDialog from "../../shared/ui/ConfirmDialog";
import { useAppAccessText } from "../../shared/i18n/app-access-i18n";
import { contentText } from "../../shared/i18n/content-language";
import { useAppText } from "../../shared/i18n/app-i18n";
type Review = {
  app: string;
  name: Record<string, string>;
  version: string;
  digest: string;
  permissions: string[];
  added: string[];
  previousVersion: string | null;
};
export default function AppConsent({
  app,
  request,
  onCancel,
  onInstall,
}: {
  app: string;
  request: RequestFn;
  onCancel: () => void;
  onInstall: (
    consent: Review & { approve: true; builtIn: string },
  ) => Promise<void>;
}) {
  const t = useAppAccessText(),
    { a, locale } = useAppText();
  const [review, setReview] = useState<Review | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    request("/api/apps/review", { builtIn: app })
      .then((v) => {
        if (active) setReview(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [app, request]);
  return (
    <ConfirmDialog
      title={t("installConsent")}
      confirmLabel={a(review?.previousVersion ? "upgrade" : "install")}
      disabled={!review || busy}
      onCancel={onCancel}
      onConfirm={async () => {
        if (!review) return;
        setBusy(true);
        setError("");
        try {
          await onInstall({ ...review, approve: true, builtIn: app });
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>{t("installHint")}</p>
      {review && (
        <>
          <strong>
            {contentText(review.name, locale, "en-GB")} · {review.version}
          </strong>
          <code className="app-key-secret">{review.digest}</code>
          <ul>
            {review.permissions.map((p) => (
              <li key={p}>
                <code>{p}</code>
                {review.added.includes(p) && (
                  <span className="soft-tag">{t("added")}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </ConfirmDialog>
  );
}
