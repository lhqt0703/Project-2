export const STICKER_IMAGES = import.meta.glob<string>("../assets/Sticker/*.{png,webp,avif}", {
  eager: true,
  import: "default",
});

export const STICKER_LIST = Object.entries(STICKER_IMAGES)
  .map(([path, url]) => {
    const filename = path.split("/").pop() || "";
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf("."));
    const num = parseInt(nameWithoutExt) || 999;
    return { filename, url, num };
  })
  .sort((a, b) => a.num - b.num);

export function getStickerUrlByFileName(fileName: string | undefined): string | null {
  if (!fileName) return null;
  const cleanName = fileName.trim();
  const entry = Object.entries(STICKER_IMAGES).find(([path]) => {
    const filename = path.split("/").pop();
    return filename === cleanName;
  });
  return entry ? entry[1] : null;
}
