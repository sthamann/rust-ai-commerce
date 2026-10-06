/** Readable checkout progress reflects reviewed server state; it never implies payment confirmation. */
import { useCheckoutText } from "../../shared/i18n/checkout-i18n";
export default function CheckoutProgress({
  reviewed,
  complete = false,
}: {
  reviewed: boolean;
  complete?: boolean;
}) {
  const { x } = useCheckoutText();
  const current = complete ? 2 : reviewed ? 1 : 0;
  return (
    <ol className="checkout-progress" aria-label={x("title")}>
      {(["detailsStep", "reviewStep", "completeStep"] as const).map(
        (key, index) => (
          <li
            key={key}
            className={index <= current ? "active" : ""}
            aria-current={index === current ? "step" : undefined}
          >
            <span aria-hidden="true">{index < current ? "✓" : index + 1}</span>
            {x(key)}
          </li>
        ),
      )}
    </ol>
  );
}
