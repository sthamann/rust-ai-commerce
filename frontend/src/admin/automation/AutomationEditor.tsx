/** AutomationEditor: focused form view with explicit typed inputs and callbacks. */
import { useAutomationText } from "../../shared/i18n/automation-i18n";
import { channelUrl } from "../channels/channel-model";
import PromotionSchedule from "./PromotionSchedule";
import { shopScope } from "../../shared/api/shop-scope";
import { useConnectedText } from "../../shared/i18n/connected-i18n";
import { useWorkbenchText } from "../../shared/i18n/workbench-i18n";
import { type Config, type Kind } from "./automation-types";

import { useEffect, useState } from "react";
import { useContentLanguage } from "../../shared/i18n/ContentLanguage";
import { contentText } from "../../shared/i18n/content-language";
import LocalizedField from "../../shared/i18n/LocalizedField";
import ContentLanguagePicker from "../../shared/i18n/ContentLanguagePicker";
import FlowBuilder from "./FlowBuilder";
import RuleBuilder from "./RuleBuilder";
export type AutomationEditorProps = {
  run: (fn: () => Promise<void>) => Promise<void>;
  request: import("../shell/studio-types").RequestFn;
  kind: Kind;
  id: string;
  advanced: string;
  data: Record<string, any>;
  setRevision: React.Dispatch<React.SetStateAction<number>>;
  w: ReturnType<typeof useWorkbenchText>["w"];
  setId: React.Dispatch<React.SetStateAction<string>>;
  revision: number;
  update: (key: string, value: unknown) => void;
  x: ReturnType<typeof useConnectedText>["x"];
  imported: string;
  setImported: React.Dispatch<React.SetStateAction<string>>;
  busy: boolean;
  manage: boolean;
  catalog: import("./RuleBuilder").AutomationCatalog;
  rows: Record<Kind, Config[]>;
  locale: ReturnType<typeof useWorkbenchText>["locale"];
  setAdvanced: React.Dispatch<React.SetStateAction<string>>;
};
export default function AutomationEditor({
  run,
  request,
  kind,
  id,
  advanced,
  data,
  setRevision,
  w,
  setId,
  revision,
  update,
  x,
  imported,
  setImported,
  busy,
  manage,
  catalog,
  rows,
  locale,
  setAdvanced,
}: AutomationEditorProps) {
  const { mainLocale } = useContentLanguage();
  const { a } = useAutomationText();
  const [categories, setCategories] = useState<any[]>([]);
  useEffect(() => {
    let active = true;
    if (kind === "channels")
      request("/api/merchant/categories")
        .then((v) => {
          if (active) setCategories(v.elements);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [kind, request]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          const result = await request(
            `/api/automation/${kind}/${id}`,
            {
              revision,
              data: advanced.trim() ? JSON.parse(advanced) : data,
            },
            "PUT",
          );
          setRevision(result.revision);
        });
      }}
    >
      <label>
        {w("identifier")}
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          required
          pattern="[a-z][a-z0-9_]{0,31}"
          disabled={revision > 0}
        />
      </label>
      <ContentLanguagePicker />
      <LocalizedField
        label={w("title")}
        value={data.name ?? {}}
        required
        maxLength={100}
        onChange={(name) => update("name", name)}
      />
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={data.active}
          onChange={(e) => update("active", e.target.checked)}
        />
        {w("enabled")}
      </label>
      {kind === "rules" && (
        <details>
          <summary>{x("import")}</summary>
          <textarea
            aria-label={x("import")}
            value={imported}
            onChange={(e) => setImported(e.target.value)}
          />
          <button
            type="button"
            className="studio-secondary"
            disabled={busy || !manage || !imported.trim()}
            onClick={() =>
              void run(async () => {
                const v = await request(
                  "/api/automation/import-condition",
                  JSON.parse(imported),
                );
                update("condition", v.condition);
              })
            }
          >
            {x("import")}
          </button>
        </details>
      )}
      {kind === "rules" && (
        <RuleBuilder
          value={data.condition}
          onChange={(r) => update("condition", r)}
          catalog={catalog}
        />
      )}
      {kind === "promotions" && (
        <>
          <label>
            {w("coupon")}
            <input
              value={data.code ?? ""}
              placeholder={w("automatic")}
              onChange={(e) => update("code", e.target.value || null)}
            />
          </label>
          <label>
            {w("discountType")}
            <select
              value={data.kind}
              onChange={(e) => update("kind", e.target.value)}
            >
              <option value="percentage">{w("percentage")}</option>
              <option value="absolute">{w("absolute")}</option>
              <option value="free_shipping">{w("shippingFree")}</option>
            </select>
          </label>
          <label>
            {w("amount")}
            <input
              type="number"
              min={0}
              step=".01"
              value={data.amount}
              onChange={(e) => update("amount", Number(e.target.value))}
            />
          </label>
          <label>
            {w("maxUses")}
            <input
              type="number"
              min={1}
              value={data.maxUses ?? ""}
              onChange={(e) =>
                update(
                  "maxUses",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </label>
        </>
      )}
      {kind === "promotions" && (
        <label>
          {w("condition")}
          <select
            value={data.rule?.type === "ruleReference" ? data.rule.ruleId : ""}
            onChange={(e) =>
              update(
                "rule",
                e.target.value
                  ? { type: "ruleReference", ruleId: e.target.value }
                  : { type: "alwaysValid" },
              )
            }
          >
            <option value="">{w("chooseRule")}</option>
            {rows.rules.map((r) => (
              <option value={r.id} key={r.id}>
                {contentText(r.data.name ?? {}, locale, mainLocale) || r.id}
              </option>
            ))}
          </select>
          <RuleBuilder
            value={data.rule}
            onChange={(r) => update("rule", r)}
            catalog={catalog}
          />
        </label>
      )}
      {kind === "promotions" && (
        <PromotionSchedule data={data} update={update} />
      )}
      {kind === "flows" && (
        <>
          <FlowBuilder data={data} update={update} catalog={catalog} />
          {data.action !== "pipeline" && (
            <LocalizedField
              label={w("instruction")}
              value={data.instruction ?? {}}
              multiline
              required
              maxLength={3200}
              onChange={(instruction) => update("instruction", instruction)}
            />
          )}
          {(data.action === "ai_proposal" ||
            data.pipeline?.nodes?.some(
              (n: any) => n.action === "ai_proposal",
            )) && (
            <label>
              {w("provider")}
              <select
                value={data.inference?.provider ?? "ollama"}
                onChange={(e) =>
                  update("inference", { provider: e.target.value })
                }
              >
                <option value="ollama">{w("localModel")}</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Claude</option>
              </select>
            </label>
          )}
        </>
      )}
      {kind === "channels" && (
        <>
          <label>
            {w("channelType")}
            <select
              value={data.kind}
              onChange={(e) => update("kind", e.target.value)}
            >
              <option value="storefront">{w("storefrontType")}</option>
              <option value="headless">{a("headless")}</option>
            </select>
          </label>
          <label>
            {w("product")}
            <input
              value={data.productIds.join(", ")}
              onChange={(e) =>
                update(
                  "productIds",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
          </label>
          <label>
            {w("categoryNavigation")}
            <select
              value={data.navigationCategoryId ?? "catalog-root"}
              onChange={(e) => update("navigationCategoryId", e.target.value)}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.data.translations[locale.slice(0, 2)]?.name ??
                    cat.data.translations.en.name}
                </option>
              ))}
            </select>
          </label>
          <a
            href={channelUrl(shopScope(), id)}
            target="_blank"
            rel="noreferrer"
          >
            {w("preview")} ↗
          </a>
        </>
      )}
      <details>
        <summary>{w("details")}</summary>
        <textarea
          rows={12}
          value={advanced || JSON.stringify(data, null, 2)}
          onChange={(e) => setAdvanced(e.target.value)}
        />
      </details>
      <button className="studio-primary" disabled={busy || !manage}>
        {w("save")}
      </button>
    </form>
  );
}
