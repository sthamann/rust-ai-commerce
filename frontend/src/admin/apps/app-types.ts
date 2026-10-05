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
    presentation?: {
      icon?: string;
      cover?: string;
      description?: Record<string, string>;
    };
    surfaces?: {
      id: string;
      location: string;
      label: Record<string, string>;
    }[];
    events?: string[];
    slots?: { location: string }[];
    runtime?: string;
    permissions: string[];
    entities: Entity[];
    actions: { name: string; description: string; handler: string }[];
  };
};
