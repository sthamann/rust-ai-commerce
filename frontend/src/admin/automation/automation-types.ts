/** Automation editor contracts and supported language codes. */
export type Kind = "rules" | "promotions" | "flows" | "channels";
export type Config = {
  id: string;
  revision: number;
  data: Record<string, any>;
};
export const langs = ["en", "de", "fr", "es"] as const;
