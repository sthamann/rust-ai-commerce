/** Common JSON/multipart request contract for app surfaces and merchant operations. */
export type RequestFn = (
  path: string,
  body?: unknown,
  method?: string,
) => Promise<any>;
