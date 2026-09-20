export const PRODUCT_MEDIA_BUCKET = "product-media";
export const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PRODUCT_VIDEO_BYTES = 50 * 1024 * 1024;

export type ProductMediaKind = "image" | "video";

const IMAGE_TYPES = new Set(["image/jpeg","image/png","image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4","video/webm","video/quicktime"]);

export function validateProductMedia(kind: ProductMediaKind, mimeType: string, size: number): string | null {
  if (!Number.isFinite(size) || size <= 0) return "Arquivo inválido.";
  if (kind === "image") {
    if (!IMAGE_TYPES.has(mimeType)) return "Use imagem JPG, PNG ou WebP.";
    if (size > MAX_PRODUCT_IMAGE_BYTES) return "A imagem deve ter no máximo 8 MB.";
    return null;
  }
  if (!VIDEO_TYPES.has(mimeType)) return "Use vídeo MP4, WebM ou MOV.";
  if (size > MAX_PRODUCT_VIDEO_BYTES) return "O vídeo deve ter no máximo 50 MB.";
  return null;
}

export function productMediaExtension(_fileName: string, mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  return "bin";
}

export function productMediaObjectPath(
  companyId: string,
  kind: ProductMediaKind,
  fileName: string,
  mimeType: string,
  objectId: string,
): string {
  const extension = productMediaExtension(fileName, mimeType);
  return `${companyId}/products/${kind}/${objectId}.${extension}`;
}
