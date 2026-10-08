/** Bind native and isolated UI actions to the same short-lived server grant; credentials stay in the host. */
import { useMemo } from "react";
import type { RequestFn } from "../api/types";
export default function useSurfaceGateway(
  request: RequestFn,
  app: string,
  surface: string,
  context: Record<string, unknown>,
  isPublic: boolean,
): RequestFn {
  const contextKey = JSON.stringify(context);
  return useMemo(() => {
    let pending: Promise<{ token: string; expiresAt: number }> | undefined;
    const prefix = isPublic ? "/store-api" : "/api";
    const base = `${prefix}/apps/${app}/surfaces/${surface}`;
    return async (path, body) => {
      const name = path.split("/").at(-1)!;
      if (!pending)
        pending = request(`${base}/grant`, { context: JSON.parse(contextKey) })
          .then((v) => ({ token: v.token, expiresAt: Date.now() + 240000 }))
          .catch((e) => {
            pending = undefined;
            throw e;
          });
      let grant = await pending;
      if (Date.now() >= grant.expiresAt) {
        pending = request(`${base}/grant`, {
          context: JSON.parse(contextKey),
        }).then((v) => ({ token: v.token, expiresAt: Date.now() + 240000 }));
        grant = await pending;
      }
      if (body instanceof FormData) {
        const multipart = new FormData();
        body.forEach((v, k) => multipart.append(k, v));
        multipart.set("grant", grant.token);
        return request(`${base}/assets`, multipart);
      }
      return request(
        name === "__bundle" ? `${base}/bundle` : `${base}/actions/${name}`,
        {
          grant: grant.token,
          input: body ?? {},
          requestKey: crypto.randomUUID(),
        },
      );
    };
  }, [request, app, surface, contextKey, isPublic]);
}
