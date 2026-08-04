const requestedImageUrls = new Set<string>();
const pendingImages = new Map<string, HTMLImageElement>();

export function preloadImages(urls: Array<string | null | undefined>) {
  for (const url of urls) {
    if (!url || requestedImageUrls.has(url)) continue;
    requestedImageUrls.add(url);

    const image = new Image();
    image.decoding = "async";
    image.onload = () => pendingImages.delete(url);
    image.onerror = () => {
      pendingImages.delete(url);
      requestedImageUrls.delete(url);
    };
    pendingImages.set(url, image);
    image.src = url;
  }
}
