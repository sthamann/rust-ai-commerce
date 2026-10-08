/** Edits the validated subscription/filter/batch contract; delivery uses the existing leased outbox. */
import type { Manifest } from "../../shared/apps/native/types";
import { useAppStudioText } from "../../shared/i18n/app-studio-i18n";
export default function AppEvents({
  manifest,
  onChange,
}: {
  manifest: Manifest;
  onChange: (m: Manifest) => void;
}) {
  const { a } = useAppStudioText();
  const events = manifest.events ?? [],
    filters = manifest.eventFilters ?? [];
  const setEvents = (values: string[]) =>
    onChange({
      ...manifest,
      events: values,
      eventFilters: filters.filter((f) => values.includes(f.event)),
      ...(values.length ? {} : { eventDelivery: undefined }),
    });
  const editFilter = (
    index: number,
    equals: (typeof filters)[number]["equals"],
  ) =>
    onChange({
      ...manifest,
      eventFilters: filters.map((f, i) => (i === index ? { ...f, equals } : f)),
    });
  const destination = (url: string) =>
    onChange({
      ...manifest,
      eventDelivery: {
        batchSize: manifest.eventDelivery?.batchSize ?? 1,
        ...(url ? { url } : {}),
      },
      permissions:
        url && !manifest.permissions.includes("events.send")
          ? [...manifest.permissions, "events.send"]
          : manifest.permissions,
    });
  return (
    <div className="app-access-grid">
      <h3>{a("subscriptions")}</h3>
      {events.map((event, index) => (
        <div className="app-access-row" key={index}>
          <label>
            {a("eventPattern")}
            <input
              value={event}
              maxLength={100}
              onChange={(e) => {
                const values = events.map((v, i) =>
                  i === index ? e.target.value : v,
                );
                const permissions = manifest.permissions.filter(
                  (p) => p !== `events:${event}`,
                );
                if (
                  e.target.value &&
                  !permissions.includes(`events:${e.target.value}`)
                )
                  permissions.push(`events:${e.target.value}`);
                onChange({
                  ...manifest,
                  events: values,
                  permissions,
                  eventFilters: filters.map((f) =>
                    f.event === event ? { ...f, event: e.target.value } : f,
                  ),
                });
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setEvents(events.filter((_, i) => i !== index))}
          >
            {a("remove")}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={events.length >= 24}
        onClick={() => setEvents([...events, ""])}
      >
        {a("addSubscription")}
      </button>
      {!!events.length && (
        <>
          <p>{a("eventFilterHint")}</p>
          {filters.map((filter, index) => (
            <section className="app-model-card" key={index}>
              <label>
                {a("eventFilter")}
                <select
                  value={filter.event}
                  onChange={(e) =>
                    onChange({
                      ...manifest,
                      eventFilters: filters.map((f, i) =>
                        i === index ? { ...f, event: e.target.value } : f,
                      ),
                    })
                  }
                >
                  {events.map((event) => (
                    <option key={event} value={event}>
                      {event}
                    </option>
                  ))}
                </select>
              </label>
              {Object.entries(filter.equals).map(
                ([field, value], condition) => (
                  <div className="app-access-row" key={condition}>
                    <label>
                      {a("filterField")}
                      <input
                        value={field}
                        maxLength={64}
                        onChange={(e) =>
                          editFilter(
                            index,
                            Object.fromEntries(
                              Object.entries(filter.equals).map(([k, v]) =>
                                k === field ? [e.target.value, v] : [k, v],
                              ),
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      {a("type")}
                      <select
                        value={value === null ? "null" : typeof value}
                        onChange={(e) =>
                          editFilter(index, {
                            ...filter.equals,
                            [field]:
                              e.target.value === "number"
                                ? 0
                                : e.target.value === "boolean"
                                  ? false
                                  : e.target.value === "null"
                                    ? null
                                    : "",
                          })
                        }
                      >
                        <option value="string">{a("string")}</option>
                        <option value="number">{a("integer")}</option>
                        <option value="boolean">{a("boolean")}</option>
                        <option value="null">{a("nullValue")}</option>
                      </select>
                    </label>
                    {typeof value === "boolean" ? (
                      <label className="app-check">
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={(e) =>
                            editFilter(index, {
                              ...filter.equals,
                              [field]: e.target.checked,
                            })
                          }
                        />
                        {a("filterValue")}
                      </label>
                    ) : (
                      value !== null && (
                        <label>
                          {a("filterValue")}
                          <input
                            type={typeof value === "number" ? "number" : "text"}
                            value={value}
                            maxLength={500}
                            onChange={(e) =>
                              editFilter(index, {
                                ...filter.equals,
                                [field]:
                                  typeof value === "number"
                                    ? Number(e.target.value)
                                    : e.target.value,
                              })
                            }
                          />
                        </label>
                      )
                    )}
                    <button
                      type="button"
                      disabled={Object.keys(filter.equals).length <= 1}
                      onClick={() =>
                        editFilter(
                          index,
                          Object.fromEntries(
                            Object.entries(filter.equals).filter(
                              ([k]) => k !== field,
                            ),
                          ),
                        )
                      }
                    >
                      {a("remove")}
                    </button>
                  </div>
                ),
              )}
              <button
                type="button"
                disabled={Object.keys(filter.equals).length >= 4}
                onClick={() =>
                  editFilter(index, {
                    ...filter.equals,
                    [`field${Object.keys(filter.equals).length + 1}`]: "",
                  })
                }
              >
                {a("addFilterCondition")}
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...manifest,
                    eventFilters: filters.filter((_, i) => i !== index),
                  })
                }
              >
                {a("remove")}
              </button>
            </section>
          ))}
          <button
            type="button"
            disabled={filters.length >= 24 || !events[0]}
            onClick={() =>
              onChange({
                ...manifest,
                eventFilters: [
                  ...filters,
                  { event: events[0], equals: { currency: "EUR" } },
                ],
              })
            }
          >
            {a("addEventFilter")}
          </button>
          <label>
            {a("eventBatch")}
            <input
              type="number"
              min={1}
              max={25}
              value={manifest.eventDelivery?.batchSize ?? 1}
              onChange={(e) =>
                onChange({
                  ...manifest,
                  eventDelivery: {
                    ...manifest.eventDelivery,
                    batchSize: Number(e.target.value),
                  },
                })
              }
            />
          </label>
          <label>
            {a("eventDestination")}
            <input
              type="url"
              value={manifest.eventDelivery?.url ?? ""}
              maxLength={2048}
              onChange={(e) => destination(e.target.value)}
            />
          </label>
          <p>{a("eventDestinationHint")}</p>
        </>
      )}
    </div>
  );
}
