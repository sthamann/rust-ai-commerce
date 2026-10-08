/** Passive operator URLs contain no browser credential; the destination editor authorizes its own owner. */
export type FrontendConnection = {
  alias: string;
  channel: string;
  url: string;
  editorUrl?: string | null;
};
export function connectionUrl(
  value: string | null | undefined,
  locale?: string,
) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      !(
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname))
      )
    )
      return undefined;
    if (locale) url.searchParams.set("locale", locale);
    return url.href;
  } catch {
    return undefined;
  }
}
