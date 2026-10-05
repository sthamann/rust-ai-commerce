/** Honest empty-media state for newly created products; never invent a product photograph. */
export default function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="shop-image-placeholder" role="img" aria-label={label}>
      <span aria-hidden="true">◇</span>
      <small>{label}</small>
    </div>
  );
}
