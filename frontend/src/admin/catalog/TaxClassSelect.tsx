/** Assign a product to an actual tenant tax class; legacy standard/reduced mapping remains explicit. */
import { useEffect, useRef, useState } from "react";
import { useInternationalText } from "../../shared/i18n/international-i18n";
import {
  inheritedText,
  type TaxClass,
} from "../../shared/geography/geography-types";
import type { RequestFn } from "../shell/studio-types";
export default function TaxClassSelect({
  request,
  value,
  onChange,
}: {
  request: RequestFn;
  value: string;
  onChange: (id: string) => void;
}) {
  const { i, locale } = useInternationalText();
  const current = useRef(request);
  current.current = request;
  const [classes, setClasses] = useState<TaxClass[]>([]),
    [main, setMain] = useState("en-GB");
  useEffect(() => {
    let active = true;
    current
      .current("/api/merchant/commerce")
      .then((v) => {
        if (active && v.data?.taxes) {
          setClasses(v.data.taxes);
          setMain(v.data.mainLocale ?? "en-GB");
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return (
    <label>
      {i("chooseClass")}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{i("legacyTax")}</option>
        {classes.map((t) => (
          <option key={t.id} value={t.id}>
            {inheritedText(t.translations ?? {}, locale, main, "name") || t.id}
          </option>
        ))}
      </select>
    </label>
  );
}
