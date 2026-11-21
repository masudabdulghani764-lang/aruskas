"use client";

/**
 * Compresses large mobile camera receipt images (JPG/PNG/WebP > 450 KB) on the client
 * using an HTML5 Canvas down to max 1600px dimension at 0.82 quality (~150-300 KB).
 * Leaves PDFs and already-compact images untouched.
 */
export async function compressReceiptImageIfNeeded(file: File): Promise<File> {
  const mime = file.type.toLowerCase();
  if (
    typeof window === "undefined" ||
    !mime.startsWith("image/") ||
    file.size <= 450 * 1024
  ) {
    return file;
  }

  try {
    const imgUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = (err) => reject(err);
        el.src = imgUrl;
      });

      const maxDim = 1600;
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (width <= 0 || height <= 0) {
        return file;
      }

      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return file;
      }

      // Fill white background so transparent PNG receipts convert cleanly to JPEG
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const outputMime = "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), outputMime, 0.82)
      );

      if (!blob || blob.size >= file.size) {
        return file;
      }

      const baseName = file.name.replace(/\.[^.]+$/, "") || "struk";
      return new File([blob], `${baseName}.jpg`, {
        type: outputMime,
        lastModified: Date.now(),
      });
    } finally {
      URL.revokeObjectURL(imgUrl);
    }
  } catch {
    return file;
  }
}
