/** ConciergeView: storefront view composed from the scoped cart/controller. */
import { productURL } from "../catalog/product-url";
import { shopApi } from "../../shared/api/shop-api";
import "../../shared/styles/apps.css";
import "../../shared/styles/workbench.css";
import "../styles/shop.css";

import { useStorefront } from "./StorefrontContext";
import { useRef } from "react";
import { useExperienceUIText } from "../../shared/i18n/experience-ui-i18n";
import Icon from "../../shared/ui/Icon";
export default function ConciergeView() {
  const { u } = useExperienceUIText();
  const input = useRef<HTMLInputElement>(null);
  const {
    s,
    run,
    wish,
    cart,
    setAdvice,
    setQuery,
    setCategory,
    setWish,
    busy,
    advice,
    products,
  } = useStorefront();
  const prompt = products.some((p) =>
    p.media[0]?.url.startsWith("/media/demo/fashion/"),
  )
    ? "fashionWish"
    : "wish";
  return (
    <section
      className="shop-concierge"
      id="assistant"
      aria-labelledby="shop-assistant-title"
    >
      <div>
        <p className="shop-kicker">
          <Icon name="spark" size={16} /> {s("ask")}
        </p>
        <h2 id="shop-assistant-title">{u("assistantIntro")}</h2>
        <p>{u("assistantHint")}</p>
        <small>
          <Icon name="box" size={14} /> {u("grounded")}
        </small>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const v = await shopApi<{
              answer: {
                explanation: string;
                recommended_ids: string[];
              };
            }>("/api/concierge", { request: wish }, cart?.token);
            setAdvice(v.answer);
            setQuery("");
            setCategory("all");
          });
        }}
      >
        <input
          ref={input}
          aria-label={s("ask")}
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder={s(prompt)}
        />
        <button disabled={busy || !wish} className="shop-secondary">
          {busy ? s("thinking") : s("ask")} ↗
        </button>
      </form>
      <div className="shop-assistant-prompts">
        {(["budget", "gift", "compare"] as const).map((key) => (
          <button
            type="button"
            key={key}
            disabled={busy}
            onClick={() => {
              setWish(u(key));
              input.current?.focus();
            }}
          >
            <Icon
              name={
                key === "budget" ? "percent" : key === "gift" ? "box" : "layers"
              }
              size={16}
            />
            {u(key)}
            <Icon name="arrow" size={14} />
          </button>
        ))}
      </div>
      {advice && (
        <div className="shop-advice" role="status">
          <p>{advice.explanation}</p>
          {advice.recommended_ids.map((pid) => (
            <a key={pid} href={productURL({ id: pid })}>
              {products.find((p) => p.id === pid)?.name} ↗
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
