/** Product-owned multilingual regulatory facts; collected evidence never claims automatic product certification. */
import { sectors } from "../../shared/legal/legal-types";
import { useLegalText } from "../../shared/i18n/legal-i18n";
import {
  productLegalFields,
  useProductLegalText,
} from "../../shared/i18n/product-legal-i18n";
import LocalizedField from "../../shared/i18n/LocalizedField";
import type { ProductDraft } from "../catalog/catalog-model";
const sectorFields: Record<string, string[]> = {
  textiles: ["fibres"],
  food: [
    "ingredients",
    "allergens",
    "nutrition",
    "netQuantity",
    "foodOperator",
    "origin",
  ],
  cosmetics: ["ingredients", "instructions"],
  electronics: [
    "instructions",
    "energyLabelUrl",
    "energySheetUrl",
    "registration",
  ],
  ageRestricted: ["ageVerification"],
  digital: ["compatibility"],
  regulated: ["registration", "instructions"],
  subscriptions: ["instructions"],
};
export default function ProductCompliance({
  draft,
  onChange,
}: {
  draft: ProductDraft;
  onChange: (v: ProductDraft) => void;
}) {
  const { l } = useLegalText(),
    { p } = useProductLegalText();
  const value = draft.extra.compliance ?? {},
    sector = value.sector ?? (draft.extra.digital ? "digital" : "general");
  const update = (patch: object) =>
    onChange({
      ...draft,
      extra: { ...draft.extra, compliance: { ...value, ...patch } },
    });
  const fields = productLegalFields.filter(
    (f) =>
      [
        "manufacturer",
        "manufacturerAddress",
        "manufacturerContact",
        "identifier",
        "warnings",
      ].includes(f) ||
      (value.nonEuManufacturer && f.startsWith("responsible")) ||
      (sectorFields[sector] ?? []).includes(f),
  );
  return (
    <div className="legal-documents">
      <p>{l("noCertification")}</p>
      <label>
        {l("sectors")}
        <select
          value={sector}
          onChange={(e) => update({ sector: e.target.value })}
        >
          {sectors.map((s) => (
            <option key={s} value={s}>
              {l(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="legal-toggle">
        <input
          type="checkbox"
          checked={!!value.nonEuManufacturer}
          onChange={(e) => update({ nonEuManufacturer: e.target.checked })}
        />
        {p("nonEuManufacturer")}
      </label>
      {fields.map((f) => (
        <LocalizedField
          key={f}
          label={p(f)}
          value={value[f] ?? {}}
          multiline
          maxLength={6000}
          onChange={(map) => update({ [f]: map })}
        />
      ))}
    </div>
  );
}
