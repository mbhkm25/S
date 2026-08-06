export function extensionFromMime(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("webm")) return "webm";
  return "bin";
}

export function sanitizePathPart(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

export function deterministicStoragePath(
  senderPhone: string,
  messageId: string,
  mimeType: string,
): string {
  return [
    "whatsapp",
    sanitizePathPart(senderPhone, "unknown_sender"),
    `${sanitizePathPart(messageId, "unknown_message")}.${
      extensionFromMime(mimeType)
    }`,
  ].join("/");
}
