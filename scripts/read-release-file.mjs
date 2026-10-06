import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { constants } from "node:fs";
import { open } from "node:fs/promises";

// Validate and read the same descriptor. O_NOFOLLOW rejects a swapped-in symlink;
// O_NONBLOCK prevents a swapped-in FIFO from hanging before fstat can reject it.
export async function readReleaseFile(path, limit = 64 * 1024 * 1024) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    assert.ok(stat.isFile(), "Release must contain ordinary files");
    assert.ok(stat.size <= limit, "Release file exceeds size limit");
    const chunks = [];
    let total = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - total));
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      assert.ok(total <= limit, "Release file exceeds size limit");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total);
  } finally {
    await file.close();
  }
}
