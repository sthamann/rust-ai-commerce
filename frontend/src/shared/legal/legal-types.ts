/** Channel-scoped legal policy, explicit optional purposes and durable consumer requests. */
export const purposes = [
  "analytics",
  "personalization",
  "externalMedia",
  "maps",
  "marketing",
] as const;
export const documents = [
  "privacy",
  "terms",
  "withdrawal",
  "shipping",
  "accessibility",
  "disputes",
] as const;
export const sectors = [
  "general",
  "textiles",
  "food",
  "cosmetics",
  "electronics",
  "ageRestricted",
  "digital",
  "subscriptions",
  "regulated",
] as const;
export type Purpose = (typeof purposes)[number];
export type LegalConfig = {
  strictCheckout: boolean;
  consentDays: number;
  purposes: Partial<Record<Purpose, boolean>>;
  services: {
    id: string;
    provider: string;
    purpose: Purpose;
    description: Record<string, string>;
    retention: string;
    privacyUrl: string;
  }[];
  documents: Partial<
    Record<(typeof documents)[number], Record<string, string>>
  >;
  sectors: string[];
  operatorNotes: Record<string, string>;
};
export type LegalPolicy = {
  data: LegalConfig;
  policyVersion: string;
  mainLocale: string;
  locales: string[];
  salesChannelId: string;
};
export type Consent = {
  choices: Partial<Record<Purpose, boolean>>;
  policyVersion: string;
  decided: boolean;
  expiresAt?: string;
};
export const defaultLegal = (): LegalConfig => ({
  strictCheckout: false,
  consentDays: 180,
  purposes: Object.fromEntries(purposes.map((p) => [p, true])),
  services: [],
  documents: {},
  sectors: ["general"],
  operatorNotes: {},
});
export type ConsumerRequest = {
  id: string;
  kind: string;
  state: string;
  revision: number;
  salesChannelId: string;
  data: {
    name: string;
    email: string;
    reference: string;
    message: string;
    receivedAt: string;
    reviewNote?: string;
  };
};
