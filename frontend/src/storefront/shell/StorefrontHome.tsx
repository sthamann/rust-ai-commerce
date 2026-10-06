/** StorefrontHome: storefront view composed from the scoped cart/controller. */
import { BRAND } from "../../shared/ui/Brand";
import CollectionView from "./CollectionView";
import ConciergeView from "./ConciergeView";

import { AppSurfaceSlot } from "../../shared/apps/AppSurfaces";
import "../../shared/styles/apps.css";
import "../../shared/styles/workbench.css";
import Icon from "../../shared/ui/Icon";
import Art from "../../shared/ui/ProductArt";
import "../styles/shop.css";

import { useStorefront } from "./StorefrontContext";
export default function StorefrontHome() {
  const { salesChannel, w, experience, s, products } = useStorefront();
  const fashion = products.some((p) =>
    p.media[0]?.url.startsWith("/media/demo/fashion/"),
  );
  const hero =
    products.find((p) => p.id === (fashion ? "coat" : "chair")) ?? products[0];
  return (
    <main className="shop-content">
      <AppSurfaceSlot location="storefront.home" context={{ salesChannel }} />
      <section className="shop-hero">
        <div>
          <p className="shop-kicker">
            {fashion ? s("fashionBrand") : BRAND.name} /{" "}
            {fashion ? s("fashionCollection") : w("consideredObjects")}
          </p>
          <h1>
            {experience?.headline &&
            experience.headline !== "Objects for a more considered everyday." &&
            experience.headline !== "A considered wardrobe. Made for everyday."
              ? experience.headline
              : s(fashion ? "fashionHero" : "hero")}
          </h1>
          <p>{s(fashion ? "fashionIntro" : "intro")}</p>
          <a className="shop-primary" href="#collection">
            {s("explore")}
            <Icon name="arrow" />
          </a>
        </div>
        <div className="shop-hero-art">
          {hero?.media[0]?.url ? (
            <img
              className="shop-hero-photo"
              src={hero.media[0].url}
              alt={hero.name}
              width={1000}
              height={1000}
              fetchPriority="high"
            />
          ) : hero ? (
            <Art id={hero.id} />
          ) : null}
          <span>01 / {hero?.name ?? s("collection")}</span>
        </div>
      </section>
      <ConciergeView />
      <CollectionView />
    </main>
  );
}
