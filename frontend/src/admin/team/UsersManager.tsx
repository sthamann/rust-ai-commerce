/** Users Manager: Personal accounts, memberships, roles, invitations and scoped developer access.. */
import { useCallback, useEffect, useState } from "react";
import { shopApi } from "../../shared/api/shop-api";
import { useShopText } from "../../shared/i18n/shop-i18n";
import "../styles/commerce-manager.css";
import PersonalAccountForm from "./PersonalAccountForm";
export type Session = {
  token?: string;
  workspace: string;
  user: { id: string; name: string; email: string };
  workspaces: { id: string; name: string; role: string }[];
};
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};
export default function UsersManager({
  token,
  workspace,
  onSession,
  onWorkspace,
  onLogout,
}: {
  token: string;
  workspace: string;
  onSession: (s: Session) => void;
  onWorkspace: (id: string, name: string) => void;
  onLogout: () => void;
}) {
  const { s, locale } = useShopText();
  const [mode, setMode] = useState("login");
  const [session, setSession] = useState<Session>();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState("");
  const role = session?.workspaces.find((w) => w.id === workspace)?.role;
  const canManage = role === "owner" || role === "admin";
  const refresh = useCallback(async () => {
    if (!token) return;
    const data = await shopApi<Session>(
      "/api/auth/session",
      undefined,
      undefined,
      undefined,
      token,
    );
    setSession(data);
    const role = data.workspaces.find((w) => w.id === workspace)?.role;
    if (role === "owner" || role === "admin")
      setMembers(
        (
          await shopApi<{ members: Member[] }>(
            "/api/workspace/members",
            undefined,
            undefined,
            undefined,
            token,
          )
        ).members,
      );
    else setMembers([]);
  }, [token, workspace, locale]);
  useEffect(() => {
    if (!token) {
      setSession(undefined);
      setMembers([]);
      return;
    }
    refresh().catch((e) => {
      setSession(undefined);
      setMembers([]);
      setError(e.message);
    });
  }, [refresh, token]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="commerce-manager users-manager">
      <div className="commerce-title">
        <div>
          <p className="kicker">COMMERCE / {s("workspace")}</p>
          <h1>{s("users")}</h1>
          <p>{s("workspaceHint")}</p>
        </div>
        {session && (
          <button
            className="studio-secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await shopApi(
                  "/api/auth/logout",
                  {},
                  undefined,
                  undefined,
                  token,
                );
                onLogout();
              })
            }
          >
            {s("logout")}
          </button>
        )}
      </div>
      {session && (
        <details>
          <summary>{s("register")}</summary>
          <form
            className="commerce-fields"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const created = await shopApi<Session>(
                  "/api/workspaces",
                  {
                    workspaceId: f.get("workspaceId"),
                    workspaceName: f.get("workspaceName"),
                  },
                  undefined,
                  undefined,
                  token,
                );
                onSession(created);
              });
            }}
          >
            <label>
              {s("workspaceName")}
              <input name="workspaceName" required maxLength={100} />
            </label>
            <label>
              {s("workspaceId")}
              <input
                name="workspaceId"
                required
                pattern="[a-z0-9][a-z0-9-]{1,47}"
              />
            </label>
            <button className="studio-primary" disabled={busy}>
              {s("register")}
            </button>
          </form>
        </details>
      )}
      {error && (
        <p className="commerce-error" role="alert">
          {error}
        </p>
      )}
      {!session ? (
        <section className="commerce-card">
          <p>{s("personalAccess")}</p>
          <div className="account-tabs">
            {["login", "register", "join"].map((m) => (
              <button
                className="studio-secondary"
                key={m}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
              >
                {s(m)}
              </button>
            ))}
          </div>
          <PersonalAccountForm
            run={run}
            mode={mode}
            onSession={onSession}
            s={s}
            busy={busy}
          />
        </section>
      ) : (
        <>
          <section className="commerce-card">
            <h2>{session.user.name}</h2>
            <p>{session.user.email}</p>
            <label>
              {s("workspace")}
              <select
                value={workspace}
                onChange={(e) => {
                  const w = session.workspaces.find(
                    (w) => w.id === e.target.value,
                  )!;
                  onWorkspace(w.id, w.name);
                }}
              >
                {session.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {s(w.role)}
                  </option>
                ))}
              </select>
            </label>
          </section>
          {canManage && (
            <>
              <section className="commerce-card">
                <h2>{s("invite")}</h2>
                <form
                  className="account-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    run(async () => {
                      const v = await shopApi<{ token: string }>(
                        "/api/workspace/invitations",
                        Object.fromEntries(form),
                        undefined,
                        undefined,
                        token,
                      );
                      setInvitation(v.token);
                      await refresh();
                    });
                  }}
                >
                  <label>
                    {s("email")}
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    {s("role")}
                    <select name="role" defaultValue="viewer">
                      {[
                        "viewer",
                        "editor",
                        "admin",
                        ...(role === "owner" ? ["owner"] : []),
                      ].map((r) => (
                        <option key={r} value={r}>
                          {s(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="studio-primary" disabled={busy}>
                    {s("invite")}
                  </button>
                </form>
                {invitation && (
                  <div className="invite-code">
                    <p role="status">{s("inviteCreated")}</p>
                    <label>
                      {s("invitationToken")}
                      <input
                        readOnly
                        value={invitation}
                        onFocus={(e) => e.target.select()}
                      />
                    </label>
                  </div>
                )}
              </section>
              <section className="commerce-card">
                <h2>{s("members")}</h2>
                {members.map((m) => (
                  <div className="member-row" key={m.id}>
                    <div>
                      <strong>{m.name}</strong>
                      <small>{m.email}</small>
                    </div>
                    <select
                      aria-label={`${s("role")} ${m.name}`}
                      value={m.role}
                      disabled={
                        busy || (role !== "owner" && m.role === "owner")
                      }
                      onChange={(e) => {
                        const next = e.target.value;
                        run(async () => {
                          await shopApi(
                            `/api/workspace/members/${m.id}`,
                            { role: next, active: m.active },
                            undefined,
                            "PUT",
                            token,
                          );
                          await refresh();
                        });
                      }}
                    >
                      {[
                        "viewer",
                        "editor",
                        "admin",
                        ...(role === "owner" || m.role === "owner"
                          ? ["owner"]
                          : []),
                      ].map((r) => (
                        <option value={r} key={r}>
                          {s(r)}
                        </option>
                      ))}
                    </select>
                    <button
                      className="studio-secondary"
                      disabled={
                        busy || (role !== "owner" && m.role === "owner")
                      }
                      onClick={() =>
                        run(async () => {
                          await shopApi(
                            `/api/workspace/members/${m.id}`,
                            { role: m.role, active: !m.active },
                            undefined,
                            "PUT",
                            token,
                          );
                          await refresh();
                        })
                      }
                    >
                      {s(m.active ? "deactivate" : "activate")}
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}
    </section>
  );
}
