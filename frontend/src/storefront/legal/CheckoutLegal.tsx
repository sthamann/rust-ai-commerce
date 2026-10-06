/** Current legal-document links and separate non-prechecked digital performance acknowledgement. */
import { useState, useEffect } from "react";
import { shopApi } from "../../shared/api/shop-api";
import { useLegalPolicy } from "./PrivacyProvider";
import { useLegalText } from "../../shared/i18n/legal-i18n";
export default function CheckoutLegal({
  token,
  onReady,
  digital,
}: {
  token: string;
  digital: boolean;
  onReady: (ready: boolean, accept?: () => Promise<void>) => void;
}) {
  const p = useLegalPolicy(),
    { l } = useLegalText();
  const [terms, setTerms] = useState(false),
    [immediate, setImmediate] = useState(false);
  useEffect(() => {
    setTerms(false);
    setImmediate(false);
  }, [p?.policyVersion]);
  useEffect(() => {
    const ready =
      !!p && (!p.data.strictCheckout || (terms && (!digital || immediate)));
    onReady(ready, async () => {
      if (!p || !ready) throw new Error(l("agree"));
      await shopApi(
        "/store-api/legal/acceptance",
        {
          policyVersion: p.policyVersion,
          terms,
          digitalImmediate: digital && immediate,
        },
        token,
        "PUT",
      );
    });
  }, [p?.policyVersion, terms, immediate, token, digital]);
  return (
    <section className="checkout-legal">
      <nav>
        {(["terms", "privacy", "withdrawal", "shipping"] as const).map((k) => (
          <a key={k} href={`#legal/${k}`} target="_blank">
            {l(k)}
          </a>
        ))}
      </nav>
      {p?.data.strictCheckout && (
        <>
          <label>
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
            />
            {l("agree")}
          </label>
          {digital && (
            <label>
              <input
                type="checkbox"
                checked={immediate}
                onChange={(e) => setImmediate(e.target.checked)}
              />
              {l("immediate")}
            </label>
          )}
        </>
      )}
    </section>
  );
}
