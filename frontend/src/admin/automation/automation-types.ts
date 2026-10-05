/** Automation editor contracts; content languages come from the selected shop. */
export type Kind = "rules" | "promotions" | "flows" | "channels";
export type Config = {
  id: string;
  revision: number;
  data: Record<string, any>;
};
