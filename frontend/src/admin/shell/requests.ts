/** Authenticated Studio transport; staging changes only the tenant, never the principal. */
import { requestJson } from "../../shared/api/request-json";
import { useMemo, useRef } from "react";
import { responseError } from "../../shared/i18n/errors-i18n";
import type { RequestFn } from "./studio-types";

export function createStudioRequest(
  token: string,
  tenant: string,
  locale: string,
): RequestFn {
  return async (path, body, method) => {
    const multipart = body instanceof FormData;
    const response = await requestJson(path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        ...(multipart ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
        "x-tenant": tenant,
        "x-commerce-locale": locale,
      },
      body:
        body === undefined
          ? undefined
          : multipart
            ? body
            : JSON.stringify(body),
    });
    const value = response.value;
    if (!response.ok)
      throw responseError(
        value.errors?.[0]?.detail || response.statusText,
        response.status,
      );
    return value;
  };
}
export function useStudioRequests(
  token: string,
  workspace: string,
  environment: string,
  locale: string,
) {
  const credential = useRef(token);
  credential.current = token;
  return useMemo(() => {
    const scoped =
      (tenant: string): RequestFn =>
      (path, body, method) =>
        createStudioRequest(credential.current, tenant, locale)(
          path,
          body,
          method,
        );
    const liveRequest = scoped(workspace);
    return {
      liveRequest,
      request: environment ? scoped(environment) : liveRequest,
    };
  }, [workspace, environment, locale]);
}
