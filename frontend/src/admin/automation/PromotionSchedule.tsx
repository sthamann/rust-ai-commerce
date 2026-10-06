/** Campaign scheduling uses ISO instants in the API and local times in the editor. */
import { useLifecycleText } from "./lifecycle-i18n";
export function localDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export default function PromotionSchedule({
  data,
  update,
}: {
  data: Record<string, any>;
  update: (key: string, value: unknown) => void;
}) {
  const t = useLifecycleText();
  return (
    <div className="promotion-schedule">
      {(["start", "end"] as const).map((key) => (
        <label key={key}>
          {t(key)}
          <input
            type="datetime-local"
            value={localDate(data[key])}
            onChange={(e) =>
              update(
                key,
                e.target.value ? new Date(e.target.value).toISOString() : null,
              )
            }
          />
        </label>
      ))}
      <label>
        {t("priority")}
        <input
          type="number"
          step={1}
          value={data.priority ?? 0}
          onChange={(e) => update("priority", Number(e.target.value))}
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={!!data.exclusive}
          onChange={(e) => update("exclusive", e.target.checked)}
        />
        {t("exclusive")}
      </label>
    </div>
  );
}
