import { readReleaseFile } from "./read-release-file.mjs";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

export async function inventory(root) {
  const files = {};
  async function visit(dir) {
    for (const stat of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      const name = stat.name;
      const path = join(dir, name);
      assert.ok(!stat.isSymbolicLink(), "Release may not contain symlinks");
      if (stat.isDirectory()) await visit(path);
      else {
        assert.ok(stat.isFile(), "Release must contain ordinary files");
        const contents = await readReleaseFile(path);
        assert.ok(
          !contents.includes(Buffer.from("slice-e2e-only")),
          "Test identity harness in release",
        );
        assert.ok(
          !/^(?:\.env|\.dev\.vars)(?:\.|$)/.test(name),
          "Secret environment file in release",
        );
        files[relative(root, path).split("\\").join("/")] = createHash("sha256")
          .update(contents)
          .digest("hex");
      }
    }
  }
  await visit(root);
  assert.ok(Object.keys(files).length > 0, "Empty release");
  return files;
}
export function digest(files) {
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}
export async function checkArtifact(root, manifest, sha, expectedDigest) {
  if (expectedDigest)
    assert.equal(manifest.digest, expectedDigest, "Unexpected validated content digest");
  assert.equal(manifest.schema, 1);
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.equal(manifest.source, sha, "Artifact source mismatch");
  assert.equal(manifest.worker, "slice-launcher");
  const files = await inventory(root);
  assert.deepEqual(files, manifest.files, "Release contents changed after validation");
  assert.equal(digest(files), manifest.digest, "Release digest mismatch");
  return manifest;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [mode, root, path, sha] = process.argv.slice(2);
  assert.ok(
    root && path && sha,
    "Usage: release-artifact.mjs create|verify <dist> <manifest> <sha>",
  );
  if (mode === "create") {
    assert.match(sha, /^[0-9a-f]{40}$/);
    const files = await inventory(root);
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, "content-digest=" + digest(files) + "\n");
    await writeFile(
      path,
      JSON.stringify(
        { schema: 1, worker: "slice-launcher", source: sha, digest: digest(files), files },
        null,
        2,
      ) + "\n",
    );
  } else {
    assert.equal(mode, "verify");
    await checkArtifact(
      root,
      JSON.parse(await readFile(path, "utf8")),
      sha,
      process.env.EXPECTED_CONTENT_DIGEST,
    );
  }
}
