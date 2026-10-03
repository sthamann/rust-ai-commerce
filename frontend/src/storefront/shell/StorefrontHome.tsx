/** StorefrontHome: storefront view composed from the scoped cart/controller. */
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
  return (
    <main className="shop-content">
      <AppSurfaceSlot location="storefront.home" context={{ salesChannel }} />
      <section className="shop-hero">
        <div>
          <p className="shop-kicker">ATELIER / {w("consideredObjects")}</p>
          <h1>
            {experience?.headline &&
            experience.headline !== "Objects for a more considered everyday."
              ? experience.headline
              : s("hero")}
          </h1>
          <p>{s("intro")}</p>
          <a className="shop-primary" href="#collection">
            {s("explore")}
            <Icon name="arrow" />
          </a>
        </div>
        <div className="shop-hero-art">
          <Art id="chair" />
          <span>
            01 /{" "}
            {products.find((p) => p.id === "chair")?.name ?? s("furniture")}
          </span>
        </div>
      </section>
      <ConciergeView />
      <CollectionView />
    </main>
  );
}
