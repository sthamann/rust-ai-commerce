/** Typed company metadata and sparse per-channel inheritance contract; statutory facts are never auto-translated. */
import type { LocalizedText } from "../../shared/i18n/content-language";
export type CompanyData = Record<
  string,
  string | LocalizedText | null | undefined
>;
export type CompanyContext = {
  inherited?: CompanyData;
  effective?: CompanyData;
  baseRevision?: number;
  channelId?: string;
};
export function companyText(data: CompanyData, key: string) {
  return typeof data[key] === "string" ? (data[key] as string) : "";
}
export function companyValue(
  base: CompanyData,
  patch: CompanyData,
  key: string,
) {
  return patch[key] ?? base[key];
}
