/** Authenticated Studio transport; staging changes only the tenant, never the principal. */
import { requestJson } from "../../shared/api/request-json";
import { useMemo } from "react";
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
  return useMemo(() => {
    const liveRequest = createStudioRequest(token, workspace, locale);
    return {
      liveRequest,
      request: environment
        ? createStudioRequest(token, environment, locale)
        : liveRequest,
    };
  }, [token, workspace, environment, locale]);
}
