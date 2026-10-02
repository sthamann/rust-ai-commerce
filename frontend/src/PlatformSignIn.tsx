/** Personal sign-in verifies the current operator grant before retaining a browser session. */
import { useState } from "react";
import {
  platformRequest as request,
  PlatformError,
  type Operator,
} from "./platform-api";
import { usePlatformText } from "./platform-i18n";
import PlatformLanguage from "./PlatformLanguage";
export default function PlatformSignIn({
  loading,
  error,
  onAuthenticated,
}: {
  loading: boolean;
  error: string;
  onAuthenticated: (token: string) => void;
}) {
  const t = usePlatformText();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const login = async () => {
    if (busy || loading) return;
    setBusy(true);
    setFailure("");
    let issued = "";
    try {
      const s = await request<{ token: string }>("", "/api/auth/login", {
        email,
        password,
      });
      issued = s.token;
      await request<Operator>(issued, "/api/platform/session");
      setPassword("");
      onAuthenticated(issued);
    } catch (e) {
      if (issued) await request(issued, "/api/auth/logout", {}).catch(() => {});
      setFailure(
        e instanceof PlatformError && e.status === 401
          ? t("invalid")
          : e instanceof PlatformError && e.status === 403
            ? t("restricted")
            : t("retry"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="platform-console platform-login">
      <div className="platform-welcome">
        <span className="platform-brand">C</span>
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </div>
      <section className="platform-panel">
        <PlatformLanguage />
        <h2>{t("signin")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <label>
            {t("email")}
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            {t("password")}
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {(failure || error) && <p role="alert">{failure || error}</p>}
          <button className="platform-primary" disabled={busy || loading}>
            {busy || loading ? t("loading") : t("login")}
          </button>
        </form>
      </section>
    </div>
  );
}
