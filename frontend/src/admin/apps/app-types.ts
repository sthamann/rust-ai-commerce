/** Installed package metadata used by app administration views. */
import type { Entity } from "./AppEntity";
export type Package = {
  uiUrl?: string;
  id: string;
  version: string;
  active: boolean;
  revision: number;
  manifest: {
    name: Record<string, string>;
    category?: string;
    permissions: string[];
    entities: Entity[];
    actions: { name: string; description: string; handler: string }[];
  };
};
