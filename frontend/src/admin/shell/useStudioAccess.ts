/** Central Studio identity boundary: initial login, expiry suspension and same-account resume. */
import { useCallback, useEffect, useRef, useState } from "react";
import { shopApi } from "../../shared/api/shop-api";
import {
  suspendMerchantToken,
  resumeMerchantToken,
} from "../../shared/api/merchant-session";
import { useConnectedText } from "../../shared/i18n/connected-i18n";
import type { Session } from "../team/UsersManager";
import type { RequestFn } from "./studio-types";
import { useStudioSession } from "./useStudioSession";

function route(hash: string) {
  const url = new URL(location.href);
  url.hash = hash;
  history.replaceState(null, "", url);
}
export function useStudioAccess(
  token: string,
  setToken: (v: string) => void,
  workspace: string,
  setWorkspace: (v: string) => void,
  connected: boolean,
  liveRequest: RequestFn,
) {
  const { x } = useConnectedText();
  const [identity, setIdentity] = useState<Session>();
  const current = useRef(identity);
  current.current = identity;
  const [expired, setExpired] = useState(false);
  const [checking, setChecking] = useState(!!token);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState("");
  const [retry, setRetry] = useState(0);
  const expire = useCallback(() => {
    suspendMerchantToken(token);
    sessionStorage.removeItem("rac-user-token");
    if (current.current) setExpired(true);
    else {
      setToken("");
      route("login");
    }
  }, [setToken, token]);
  useStudioSession(token, connected && !expired, liveRequest, expire);
  useEffect(() => {
    if (!token) {
      setIdentity(undefined);
      setVerified("");
      setChecking(false);
      route("login");
      return;
    }
    let active = true;
    setChecking(true);
    void shopApi<Session>(
      "/api/auth/session",
      undefined,
      undefined,
      undefined,
      token,
    )
      .then((session) => {
        if (!active) return;
        if (current.current && session.user.id !== current.current.user.id)
          throw new Error(x("resumeSameAccount"));
        if (!session.workspaces.some((w) => w.id === workspace))
          throw new Error(x("studioShopAccess"));
        resumeMerchantToken(token);
        setIdentity(session);
        setVerified(JSON.stringify([token, workspace]));
        setExpired(false);
        setError("");
        route("merchant");
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [token, workspace, retry]);
  const accept = async (session: Session) => {
    if (!session.token) throw new Error(x("studioSignIn"));
    if (identity && session.user.id !== identity.user.id)
      throw new Error(x("resumeSameAccount"));
    const member = session.workspaces.find((w) => w.id === workspace);
    if (!member && identity) throw new Error(x("studioShopAccess"));
    const target =
      member?.id ??
      session.workspaces.find((w) => w.id === session.workspace)?.id;
    if (!target) throw new Error(x("studioShopAccess"));
    resumeMerchantToken(session.token);
    sessionStorage.setItem("rac-user-token", session.token);
    sessionStorage.setItem("rac-user-workspace", target);
    const url = new URL(location.href);
    if (workspace !== target) {
      url.searchParams.delete("entity");
      url.searchParams.delete("studio");
    }
    url.searchParams.set("shop", target);
    url.hash = "merchant";
    history.replaceState(null, "", url);
    setWorkspace(target);
    setToken(session.token);
    setIdentity(session);
    setVerified(JSON.stringify([session.token, target]));
    setExpired(false);
    setError("");
  };
  useEffect(() => {
    const url = new URL(location.href);
    const ticket = url.searchParams.get("login_ticket");
    if (!ticket) return;
    url.searchParams.delete("login_ticket");
    history.replaceState(null, "", url);
    setChecking(true);
    void shopApi<Session>("/api/auth/redeem", { ticket })
      .then(accept)
      .catch((e) => setError(e.message))
      .finally(() => setChecking(false));
  }, []);
  const logout = () => {
    sessionStorage.removeItem("rac-user-token");
    sessionStorage.removeItem("rac-user-workspace");
    setToken("");
    setIdentity(undefined);
    setVerified("");
    setExpired(false);
    setError("");
    route("login");
    // Explicitly leaving discards private in-memory editors; reauthentication does not.
    window.location.reload();
  };
  return {
    identity,
    expired,
    checking,
    error,
    accept,
    logout,
    active:
      !!identity && verified === JSON.stringify([token, workspace]) && !expired,
    retry: () => setRetry((v) => v + 1),
  };
}
