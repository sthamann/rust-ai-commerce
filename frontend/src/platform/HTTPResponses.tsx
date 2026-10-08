/** Exact HTTP outcomes; historical undifferentiated totals never become fabricated success rates. */
import { useControlText } from "../shared/i18n/control-i18n";
import { useLocale } from "../shared/i18n/i18n";
import type { Traffic } from "./platform-api";
export default function HTTPResponses({
  traffic,
}: {
  traffic: Pick<Traffic, "failures" | "responses">;
}) {
  const c = useControlText(),
    { number } = useLocale();
  const responses = Object.entries(traffic.responses ?? {}).filter(
    ([code, count]) =>
      /^[45][0-9]{2}$/.test(code) && Number.isSafeInteger(count) && count >= 0,
  );
  const sum = (matches: (code: number) => boolean) =>
    responses.reduce(
      (n, [code, count]) => n + (matches(Number(code)) ? count : 0),
      0,
    );
  const historical = Math.max(0, traffic.failures - sum(() => true));
  return (
    <div className="platform-http-outcomes">
      <span>
        {c("httpAccess")}:{" "}
        <strong>{number(sum((code) => code === 401 || code === 403))}</strong>
      </span>
      <span>
        {c("httpClient")}:{" "}
        <strong>
          {number(sum((code) => code < 500 && code !== 401 && code !== 403))}
        </strong>
      </span>
      <span>
        {c("httpServer")}: <strong>{number(sum((code) => code >= 500))}</strong>
      </span>
      {historical > 0 && (
        <span>
          {c("httpHistorical")}: <strong>{number(historical)}</strong>
        </span>
      )}
      <details>
        <summary>{c("httpDetails")}</summary>
        <p>{c("httpHint")}</p>
        {responses.length ? (
          <ul>
            {responses
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([code, count]) => (
                <li key={code}>
                  <code>{code}</code>: {number(count)}
                </li>
              ))}
          </ul>
        ) : (
          <p>{c("httpNoBreakdown")}</p>
        )}
      </details>
    </div>
  );
}
