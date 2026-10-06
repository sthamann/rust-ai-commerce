/** Private merchant-session rejection signals shared by all JSON transports. */
type SessionFailure = { token: string; detail: string };
const listeners = new Set<(failure: SessionFailure) => void>();
const authFailures = new Set([
  "Session or integration key expired or invalid",
  "Personal merchant session required",
  "Merchant login required",
]);

export function onMerchantSessionFailure(
  listener: (failure: SessionFailure) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportMerchantSessionFailure(
  path: string,
  headers: HeadersInit | undefined,
  status: number,
  detail: string | undefined,
) {
  // Provider/customer failures and failed login attempts do not revoke Studio.
  if (
    status !== 401 ||
    !path.startsWith("/api/") ||
    path.startsWith("/api/platform/") ||
    ["/api/auth/login", "/api/auth/register", "/api/auth/accept"].includes(
      path,
    ) ||
    !detail ||
    !authFailures.has(detail)
  )
    return;
  const authorization = new Headers(headers).get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return;
  const token = authorization.slice(7);
  if (!token) return;
  for (const listener of listeners) listener({ token, detail });
}
