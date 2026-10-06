/** Tenant-owned address cards, defaults and revision-aware CRUD shared by account and CRM. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RequestFn } from "../api/types";
import { useCustomerText } from "../i18n/customer-i18n";
import { useCrmText } from "../i18n/crm-i18n";
import ConfirmDialog from "../ui/ConfirmDialog";
import AddressCard from "./AddressCard";
import AddressFields from "./AddressFields";
import {
  emptyAddress,
  type Address,
  type AddressEntry,
  type AddressList,
} from "./customer-types";
export default function AddressBook({
  request,
  path,
  countries,
  canEdit = true,
  onChange,
}: {
  request: RequestFn;
  path: string;
  countries: string[];
  canEdit?: boolean;
  onChange?: () => void;
}) {
  const { c } = useCustomerText();
  const { r } = useCrmText();
  const [deleting, setDeleting] = useState<AddressEntry>();
  const [list, setList] = useState<AddressList>();
  const [editing, setEditing] = useState<AddressEntry>();
  const [draft, setDraft] = useState<Address>();
  const [billing, setBilling] = useState(false),
    [shipping, setShipping] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const inflight = useRef(false);
  const load = useCallback(
    async () => setList(await request(path)),
    [request, path],
  );
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  const run = async (fn: () => Promise<unknown>) => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
      onChange?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };
  const edit = (entry?: AddressEntry) => {
    setEditing(entry);
    setDraft(entry?.address ?? emptyAddress(countries[0] ?? "DE"));
    setBilling(!!entry && entry.id === list?.defaultBillingAddressId);
    setShipping(!!entry && entry.id === list?.defaultShippingAddressId);
    setMessage("");
  };
  return (
    <section className="customer-address-book">
      <div className="section-heading">
        <div>
          <h3>{c("addressBook")}</h3>
          <small>{list?.elements.length ?? 0} / 100</small>
        </div>
        {canEdit && !draft && (
          <button
            type="button"
            className="studio-secondary shop-secondary"
            onClick={() => edit()}
          >
            {c("addAddress")}
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {draft ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await request(
                editing ? `${path}/${editing.id}` : path,
                {
                  address: draft,
                  ...(editing ? { revision: editing.revision } : {}),
                  defaultBilling: billing,
                  defaultShipping: shipping,
                },
                editing ? "PUT" : "POST",
              );
              setDraft(undefined);
              setMessage(c("saved"));
            });
          }}
        >
          <h4>{c(editing ? "editAddress" : "addAddress")}</h4>
          <AddressFields
            request={request}
            value={draft}
            onChange={setDraft}
            countries={countries}
            disabled={busy}
          />
          <div className="customer-defaults">
            <label>
              <input
                type="checkbox"
                checked={billing}
                onChange={(e) => setBilling(e.target.checked)}
              />
              {c("defaultBilling")}
            </label>
            <label>
              <input
                type="checkbox"
                checked={shipping}
                onChange={(e) => setShipping(e.target.checked)}
              />
              {c("defaultShipping")}
            </label>
          </div>
          <div className="customer-actions">
            <button disabled={busy} className="studio-primary shop-primary">
              {c("save")}
            </button>
            <button
              type="button"
              disabled={busy}
              className="studio-secondary shop-secondary"
              onClick={() => setDraft(undefined)}
            >
              {c("cancel")}
            </button>
          </div>
        </form>
      ) : (
        <div className="customer-address-grid">
          {!list?.elements.length && <p>{c("noAddresses")}</p>}
          {list?.elements.map((entry) => (
            <article key={entry.id}>
              <div className="customer-address-badges">
                {entry.id === list.defaultBillingAddressId && (
                  <span>{c("defaultBilling")}</span>
                )}
                {entry.id === list.defaultShippingAddressId && (
                  <span>{c("defaultShipping")}</span>
                )}
              </div>
              <AddressCard address={entry.address} />
              {canEdit && (
                <div className="customer-actions">
                  <button
                    type="button"
                    disabled={busy}
                    className="studio-secondary shop-secondary"
                    onClick={() => edit(entry)}
                  >
                    {c("editAddress")}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="studio-secondary shop-secondary"
                    onClick={() => setDeleting(entry)}
                  >
                    {c("delete")}
                  </button>
                  {(["billing", "shipping"] as const).map(
                    (kind) =>
                      entry.id !==
                        (kind === "billing"
                          ? list.defaultBillingAddressId
                          : list.defaultShippingAddressId) && (
                        <button
                          type="button"
                          key={kind}
                          disabled={busy}
                          className="studio-secondary shop-secondary"
                          onClick={() =>
                            void run(async () => {
                              await request(
                                `${path}/${entry.id}`,
                                {
                                  address: entry.address,
                                  revision: entry.revision,
                                  defaultBilling: kind === "billing",
                                  defaultShipping: kind === "shipping",
                                },
                                "PUT",
                              );
                              setMessage(c("saved"));
                            })
                          }
                        >
                          {r(kind === "billing" ? "useBilling" : "useShipping")}
                        </button>
                      ),
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {deleting && (
        <ConfirmDialog
          title={r("deleteAddress")}
          confirmLabel={r("delete")}
          disabled={busy}
          onCancel={() => {
            if (!busy) setDeleting(undefined);
          }}
          onConfirm={() =>
            void run(async () => {
              await request(
                `${path}/${deleting.id}`,
                { revision: deleting.revision },
                "DELETE",
              );
              setDeleting(undefined);
              setMessage(c("addressDeleted"));
            })
          }
        >
          <AddressCard address={deleting.address} />
          <p>{r("deleteAddressHint")}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
