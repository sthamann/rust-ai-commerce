/** Typed knowledge read models preserve source ownership, revisions, sampling and privacy boundaries. */
export type SourceKind =
  | "document"
  | "datasheet"
  | "manual"
  | "care"
  | "faq"
  | "shipping"
  | "returns"
  | "warranty"
  | "brand";
export const sourceKinds: SourceKind[] = [
  "document",
  "datasheet",
  "manual",
  "care",
  "faq",
  "shipping",
  "returns",
  "warranty",
  "brand",
];
export type Source = {
  id: string;
  product_id: string | null;
  title: string;
  kind: SourceKind;
  locale: string;
  visibility: "private" | "public";
  archived: boolean;
  revision: number;
  content_hash: string;
  source_type: string;
  created_at: string;
  chunkCount: number;
  indexedChunks: number;
  translationLocales: string[];
};
export type SourceDetail = Source & {
  content: string;
  translations: Record<
    string,
    { title?: string | null; content?: string | null }
  >;
};
export type Workspace = {
  totals: Record<string, number>;
  sources: Source[];
  next: string | null;
  activity: {
    id: number;
    kind: string;
    time: string;
    sourceId: string | null;
    hypothesisId: string | null;
  }[];
  mainLocale: string;
  locales: string[];
  canWrite: boolean;
  sampleLimits: Record<string, number>;
};
export type ExternalSource = {
  app: string;
  sourceId: string;
  title: string;
  text: string;
  sourceUrl: string;
  digest: string;
  visibility: string;
};
export type PreviewResult = {
  audience: string;
  locale: string;
  product: { id: string; name: string; description: string } | null;
  sources: {
    documentId: string;
    sourceId: string;
    title: string;
    text: string;
    contentHash: string;
    locale: string;
  }[];
  external: ExternalSource[];
  retrieval: string;
  modelCalled: boolean;
  sideEffects: boolean;
};
