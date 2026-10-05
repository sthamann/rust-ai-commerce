/** Pure gallery operations preserve order, explicit alt translations and upload bounds without fabricating language values. */
import { contentText } from "../../shared/i18n/content-language";
export type GalleryImage = {
  id: string;
  url: string;
  view: string;
  alt?: Record<string, string | null | undefined>;
};
export function mediaAlt(
  m: GalleryImage,
  language: string,
  mainLocale: string,
) {
  return m.alt ? contentText(m.alt, language, mainLocale) : m.view;
}
export function moveImage(media: GalleryImage[], from: number, to: number) {
  if (from < 0 || to < 0 || from >= media.length || to >= media.length)
    return media;
  const next = [...media],
    item = next.splice(from, 1)[0];
  next.splice(to, 0, item);
  return next;
}
export function validImages(files: File[], count: number) {
  return (
    files.length > 0 &&
    count + files.length <= 20 &&
    files.every(
      (f) =>
        ["image/png", "image/jpeg", "image/webp"].includes(f.type) &&
        f.size > 0 &&
        f.size <= 8 * 1024 * 1024,
    )
  );
}
