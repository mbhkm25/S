import {
  deterministicStoragePath,
  extensionFromMime,
  sanitizePathPart,
} from "./intake-utils.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (Object.is(actual, expected)) return;
  throw new Error(
    `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
  );
}

Deno.test("storage path is deterministic for the WhatsApp message id", () => {
  const first = deterministicStoragePath(
    "+967 777 123 456",
    "wamid.HBgMNTY3:test/value",
    "image/jpeg",
  );
  const second = deterministicStoragePath(
    "+967 777 123 456",
    "wamid.HBgMNTY3:test/value",
    "image/jpeg",
  );

  assertEquals(first, second);
  assertEquals(
    first,
    "whatsapp/967_777_123_456/wamid.HBgMNTY3_test_value.jpg",
  );
});

Deno.test("path parts cannot create parent traversal", () => {
  assertEquals(sanitizePathPart("../../receipt", "document"), ".._.._receipt");
  assertEquals(sanitizePathPart("   ", "document"), "document");
});

Deno.test("supported MIME extensions remain stable", () => {
  assertEquals(extensionFromMime("application/pdf"), "pdf");
  assertEquals(extensionFromMime("image/webp"), "webp");
  assertEquals(extensionFromMime("application/octet-stream"), "bin");
});
