/** Authenticated binary download, never placing session credentials in a URL. */
import { responseError } from "../i18n/errors-i18n";
export async function downloadFile(
  path: string,
  headers: Record<string, string>,
) {
  const r = await fetch(path, { headers });
  if (!r.ok) {
    const v = await r.json();
    throw responseError(v.errors?.[0]?.detail ?? r.statusText, r.status);
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    r.headers.get("content-disposition")?.match(/filename="?([^";]+)/)?.[1] ??
    "document.pdf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
