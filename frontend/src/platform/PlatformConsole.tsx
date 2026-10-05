/** Independent platform control plane: personal operator access, bounded statistics and audited shop creation. */
import Brand from "../shared/ui/Brand";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "../shared/i18n/i18n";
import { usePlatformText } from "../shared/i18n/platform-i18n";
import {
  PlatformError,
  platformRequest as request,
  type Audit,
  type Operator,
  type Overview,
  type ShopDetail,
  type ShopPage,
} from "./platform-api";
import PlatformDashboard from "./PlatformDashboard";
import PlatformLanguage from "./PlatformLanguage";
import PlatformShops, { CreateShop, type NewShop } from "./PlatformShops";
import PlatformSignIn from "./PlatformSignIn";
import "./styles/platform.css";
const storage = "rac-platform-token";
export default function PlatformConsole() {
  const t = usePlatformText(),
    { date } = useLocale();
  const [token, setToken] = useState(
      () => sessionStorage.getItem(storage) || "",
    ),
    [operator, setOperator] = useState<Operator>(),
    [overview, setOverview] = useState<Overview>(),
    [page, setPage] = useState<ShopPage>(),
    [audit, setAudit] = useState<Audit[]>([]),
    [detail, setDetail] = useState<ShopDetail>();
  const [view, setView] = useState<"overview" | "shops" | "activity">(
      "overview",
    ),
    [days, setDays] = useState(30),
    [search, setSearch] = useState(""),
    [create, setCreate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef(0);
  const [refresh, setRefresh] = useState(0);
  const fail = (e: unknown) => {
    setError(
      e instanceof PlatformError && (e.status === 401 || e.status === 403)
        ? t("restricted")
        : t("retry"),
    );
  };
  useEffect(() => {
    if (!token) return;
    const current = ++generation.current;
    setBusy(true);
    setError("");
    Promise.all([
      request<Operator>(token, "/api/platform/session"),
      request<Overview>(token, `/api/platform/overview?days=${days}`),
      request<ShopPage>(
        token,
        `/api/platform/shops?days=${days}&search=${encodeURIComponent(search)}`,
      ),
      request<{ elements: Audit[] }>(token, "/api/platform/audit"),
    ])
      .then(([o, m, s, a]) => {
        if (current !== generation.current) return;
        setOperator(o);
        setOverview(m);
        setPage(s);
        setAudit(a.elements);
      })
      .catch((e) => {
        if (current !== generation.current) return;
        fail(e);
        if (
          e instanceof PlatformError &&
          (e.status === 401 || e.status === 403)
        ) {
          sessionStorage.removeItem(storage);
          setToken("");
          setOperator(undefined);
          setOverview(undefined);
          setPage(undefined);
          setAudit([]);
          setDetail(undefined);
        }
      })
      .finally(() => {
        if (current === generation.current) setBusy(false);
      });
    return () => {
      generation.current++;
    };
  }, [token, days, search, refresh]);
  const logout = async () => {
    generation.current++;
    sessionStorage.removeItem(storage);
    setToken("");
    setOperator(undefined);
    setOverview(undefined);
    setPage(undefined);
    setAudit([]);
    setDetail(undefined);
    setCreate(false);
    setError("");
    setNotice("");
    setBusy(false);
    await request(token, "/api/auth/logout", {}).catch(() => {});
  };
  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const current = generation.current;
    try {
      await task();
    } catch (e) {
      if (current === generation.current) fail(e);
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  const provision = async (body: NewShop) =>
    run(async () => {
      await request(token, "/api/platform/shops", body);
      setCreate(false);
      setNotice(t("success"));
      setView("shops");
      setSearch(body.id);
      setPage(
        await request(
          token,
          `/api/platform/shops?days=${days}&search=${encodeURIComponent(body.id)}`,
        ),
      );
      setOverview(await request(token, `/api/platform/overview?days=${days}`));
      setAudit(
        (await request<{ elements: Audit[] }>(token, "/api/platform/audit"))
          .elements,
      );
    });
  if (!operator)
    return (
      <PlatformSignIn
        loading={busy}
        error={error}
        onAuthenticated={(value) => {
          sessionStorage.setItem(storage, value);
          setError("");
          setToken(value);
        }}
      />
    );
  return (
    <div className="platform-console">
      <aside>
        <div className="platform-brand">
          <Brand markOnly />
        </div>
        <strong>{t("title")}</strong>
        <nav>
          {(["overview", "shops", "activity"] as const).map((v) => (
            <button
              key={v}
              className={view === v ? "selected" : ""}
              onClick={() => {
                setView(v);
                setNotice("");
                setDetail(undefined);
                setCreate(false);
              }}
            >
              {t(v)}
            </button>
          ))}
        </nav>
        <div className="platform-profile">
          <strong>{operator.user.name}</strong>
          <small>{operator.user.email}</small>
          <button onClick={() => void logout()}>{t("logout")}</button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <small>{t("title")}</small>
            <h1>{t(view)}</h1>
          </div>
          <div className="platform-actions">
            <PlatformLanguage />
            <select
              aria-label={t("orders")}
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
                setDetail(undefined);
              }}
            >
              {[7, 30, 90].map((d) => (
                <option key={d} value={d}>
                  {d} {t("days")}
                </option>
              ))}
            </select>
            <button
              disabled={busy}
              onClick={() => {
                setRefresh((x) => x + 1);
              }}
            >
              {t("refresh")}
            </button>
            <button
              className="platform-primary"
              onClick={() => {
                setView("shops");
                setDetail(undefined);
                setCreate(true);
              }}
            >
              {t("create")}
            </button>
          </div>
        </header>
        {error && (
          <p className="platform-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="platform-notice">
            {notice}
          </p>
        )}
        {busy && <p role="status">{t("loading")}</p>}
        {create ? (
          <CreateShop
            busy={busy}
            onCreate={(body) => void provision(body)}
            onCancel={() => setCreate(false)}
          />
        ) : detail && overview ? (
          <>
            <button onClick={() => setDetail(undefined)}>← {t("back")}</button>
            <PlatformDashboard data={overview} detail={detail} />
          </>
        ) : view === "overview" && overview ? (
          <PlatformDashboard data={overview} />
        ) : view === "shops" && page ? (
          <PlatformShops
            page={page}
            busy={busy}
            onSearch={setSearch}
            onMore={() =>
              void run(async () => {
                const more = await request<ShopPage>(
                  token,
                  `/api/platform/shops?days=${days}&search=${encodeURIComponent(search)}&after=${encodeURIComponent(page.nextCursor || "")}`,
                );
                setPage({
                  ...more,
                  elements: [...page.elements, ...more.elements],
                });
              })
            }
            onDetail={(s) =>
              void run(async () =>
                setDetail(
                  await request(
                    token,
                    `/api/platform/shops/${s.id}?days=${days}`,
                  ),
                ),
              )
            }
          />
        ) : view === "activity" ? (
          <section className="platform-panel">
            <h2>{t("activity")}</h2>
            {audit.length ? (
              <table>
                <thead>
                  <tr>
                    <th>{t("created")}</th>
                    <th>{t("action")}</th>
                    <th>{t("shops")}</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}>
                      <td>{date(a.time)}</td>
                      <td>
                        {(
                          {
                            "shop.created": t("shopCreated"),
                            "operator.grant": t("operatorGranted"),
                            "operator.revoke": t("operatorRevoked"),
                            "operator.bootstrap": t("operatorBootstrap"),
                          } as Record<string, string>
                        )[a.action] || a.action}
                      </td>
                      <td>{a.shop || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>{t("noActivity")}</p>
            )}
          </section>
        ) : null}
        {overview && (
          <footer>
            {t("fresh")}: {date(overview.generatedAt)}
          </footer>
        )}
      </main>
    </div>
  );
}
