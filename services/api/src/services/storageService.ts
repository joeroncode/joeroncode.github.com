import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const extensionByMimeType: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Minimal local-disk object storage for dev/demo use. Swap this out for an
 * S3/GCS-backed implementation behind the same signature in production.
 */
export async function saveVerificationImage(
  orderId: string,
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const extension = extensionByMimeType[mimeType] ?? "jpg";
  const filename = `${orderId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${extension}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(filePath, Buffer.from(imageBase64, "base64"));
  return `/uploads/${filename}`;
}
