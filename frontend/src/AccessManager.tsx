/** Fine-grained team overrides, revocable invitations and personal session inventory. */
import { useState, useEffect, useCallback } from "react";
import type { RequestFn } from "./studio-types";
import { useOperationsText } from "./operations-i18n";
export default function AccessManager({ request }: { request: RequestFn }) {
  const { o, locale } = useOperationsText();
  const [members, setMembers] = useState<any[]>([]),
    [invites, setInvites] = useState<any[]>([]),
    [sessions, setSessions] = useState<any[]>([]),
    [scopes, setScopes] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<any[]>([]),
    [newKey, setNewKey] = useState(""),
    [keyScopes, setKeyScopes] = useState<string[]>(["orders.read"]),
    [canManage, setCanManage] = useState(false);
  const load = useCallback(async () => {
    const access = await request("/api/auth/access");
    setScopes(access.available);
    setCanManage(access.permissions.includes("team.manage"));
    if (access.permissions.includes("team.manage")) {
      const v = await request("/api/workspace/members");
      setMembers(v.members);
      setInvites(v.invitations);
      setKeys((await request("/api/workspace/integrations")).elements);
    }
    setSessions((await request("/api/auth/sessions")).sessions);
  }, [request]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  const run = async (fn: () => Promise<unknown>) => {
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
      <section className="studio-card">
        <h2>{o("access")}</h2>
        <p>{o("accessHint")}</p>
        {members
          .filter((m) => m.role !== "owner")
          .map((m) => (
            <details key={m.id}>
              <summary>
                {m.name} · {m.email}
              </summary>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={m.permissions === null}
                  onChange={(e) =>
                    setMembers(
                      members.map((x) =>
                        x.id === m.id
                          ? { ...x, permissions: e.target.checked ? null : [] }
                          : x,
                      ),
                    )
                  }
                />
                {o("defaultRights")}
              </label>
              {m.permissions !== null && (
                <div className="permission-grid">
                  {scopes.map((scope) => (
                    <label className="checkbox-label" key={scope}>
                      <input
                        type="checkbox"
                        checked={m.permissions.includes(scope)}
                        onChange={(e) =>
                          setMembers(
                            members.map((x) =>
                              x.id === m.id
                                ? {
                                    ...x,
                                    permissions: e.target.checked
                                      ? [...x.permissions, scope]
                                      : x.permissions.filter(
                                          (s: string) => s !== scope,
                                        ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      {o(scope)}
                    </label>
                  ))}
                </div>
              )}
              <button
                disabled={busy}
                className="studio-primary"
                onClick={() =>
                  run(() =>
                    request(
                      `/api/workspace/members/${m.id}`,
                      {
                        role: m.role,
                        active: m.active,
                        permissions: m.permissions,
                      },
                      "PUT",
                    ),
                  )
                }
              >
                {o("save")}
              </button>
            </details>
          ))}
        {invites.length > 0 && (
          <>
            <h3>{o("invites")}</h3>
            {invites.map((i) => (
              <div key={i.id} className="operation-row">
                <span>{i.email}</span>
                <span>{new Date(i.expires).toLocaleString(locale)}</span>
                <button
                  disabled={busy}
                  className="studio-secondary"
                  onClick={() =>
                    run(() =>
                      request(
                        `/api/workspace/invitations/${i.id}`,
                        undefined,
                        "DELETE",
                      ),
                    )
                  }
                >
                  {o("revoke")}
                </button>
              </div>
            ))}
          </>
        )}
      </section>
      <section className="studio-card">
        <h2>{o("sessions")}</h2>
        {sessions.map((s) => (
          <div className="operation-row" key={s.id}>
            <span>{new Date(s.createdAt).toLocaleString(locale)}</span>
            {s.current ? (
              <span>{o("current")}</span>
            ) : (
              <button
                disabled={busy}
                className="studio-secondary"
                onClick={() =>
                  run(() =>
                    request(`/api/auth/sessions/${s.id}`, undefined, "DELETE"),
                  )
                }
              >
                {o("revoke")}
              </button>
            )}
          </div>
        ))}
      </section>
      {canManage && (
        <section className="studio-card">
          <h2>{o("integrations")}</h2>
          <p>{o("keyHint")}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const v = await request("/api/workspace/integrations", {
                  name: f.get("name"),
                  expiresInDays: Number(f.get("days")),
                  permissions: keyScopes,
                });
                setNewKey(v.key);
              });
            }}
          >
            <label>
              {o("name")}
              <input name="name" required maxLength={100} />
            </label>
            <label>
              {o("expiry")}
              <input
                name="days"
                type="number"
                min={1}
                max={90}
                defaultValue={30}
                required
              />
            </label>
            <div className="permission-grid">
              {scopes.map((scope) => (
                <label className="checkbox-label" key={scope}>
                  <input
                    type="checkbox"
                    checked={keyScopes.includes(scope)}
                    onChange={(e) =>
                      setKeyScopes(
                        e.target.checked
                          ? [...keyScopes, scope]
                          : keyScopes.filter((s) => s !== scope),
                      )
                    }
                  />
                  {o(scope)}
                </label>
              ))}
            </div>
            <button disabled={busy} className="studio-primary">
              {o("createKey")}
            </button>
          </form>
          {newKey && (
            <input
              aria-label={o("createKey")}
              readOnly
              value={newKey}
              onFocus={(e) => e.target.select()}
            />
          )}{" "}
          {keys.map((k) => (
            <div className="operation-row" key={k.id}>
              <strong>{k.name}</strong>
              <span>{new Date(k.expiresAt).toLocaleString(locale)}</span>
              <button
                disabled={busy}
                className="studio-secondary"
                onClick={() =>
                  run(() =>
                    request(
                      `/api/workspace/integrations/${k.id}`,
                      undefined,
                      "DELETE",
                    ),
                  )
                }
              >
                {o("revoke")}
              </button>
            </div>
          ))}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
