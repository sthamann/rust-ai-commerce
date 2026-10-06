/** Price-tax selection and permission-filtered extension slots attached to the product editor. */
import { AppSurfaceSlot } from "../../shared/apps/AppSurfaces";
import TaxClassSelect from "./TaxClassSelect";
import type { RequestFn } from "../shell/studio-types";
import type { ProductDraft } from "./catalog-model";
export default function ProductEditorExtras({
  id,
  tab,
  draft,
  request,
  change,
  selectedApp,
}: {
  id: string;
  tab: string;
  draft: ProductDraft;
  request: RequestFn;
  change: (draft: ProductDraft) => void;
  selectedApp: boolean;
}) {
  return (
    <>
      {" "}
      {tab === "prices" && (
        <TaxClassSelect
          request={request}
          value={draft.extra.taxClassId ?? ""}
          onChange={(taxClassId) =>
            change({
              ...draft,
              extra: { ...draft.extra, taxClassId: taxClassId || null },
            })
          }
        />
      )}
      {id && tab === "general" && (
        <AppSurfaceSlot
          location="admin.product.general"
          context={{ productId: id }}
        />
      )}
      {id && !selectedApp && (
        <AppSurfaceSlot location="admin.product" context={{ productId: id }} />
      )}
    </>
  );
}
