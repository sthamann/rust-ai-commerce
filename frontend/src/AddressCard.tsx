/** Human-readable address used in order snapshots and address books. */
import type { Address } from "./customer-types";
export default function AddressCard({ address }: { address?: Address | null }) {
  if (!address) return <p>—</p>;
  return (
    <address className="customer-address-card">
      <strong>
        {address.name || `${address.firstName ?? ""} ${address.lastName ?? ""}`}
      </strong>
      {address.company && (
        <span>
          {address.company}
          {address.department ? ` · ${address.department}` : ""}
        </span>
      )}
      <span>{address.street}</span>
      {address.additionalAddressLine1 && (
        <span>{address.additionalAddressLine1}</span>
      )}
      {address.additionalAddressLine2 && (
        <span>{address.additionalAddressLine2}</span>
      )}
      <span>
        {address.postalCode} {address.city} · {address.country ?? "DE"}
      </span>
      {address.phoneNumber && <span>{address.phoneNumber}</span>}
      {address.vatId && <small>{address.vatId}</small>}
    </address>
  );
}
