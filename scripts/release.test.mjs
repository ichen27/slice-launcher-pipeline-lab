import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkArtifact, digest, inventory } from "./release-artifact.mjs";
import {
  validateDeployment,
  validateVerifiedRelease,
  validateSourceRun,
  loadRollbackProvenance,
} from "./release-provenance.mjs";

const sha = "a".repeat(40);
const version = "11111111-1111-4111-8111-111111111111";
const deployment = "22222222-2222-4222-8222-222222222222";
const repository = "ichen27/slice-launcher";
const run = {
  repository: { full_name: repository },
  head_repository: { full_name: repository },
  id: 123,
  path: ".github/workflows/deploy-launcher.yml",
  status: "completed",
  conclusion: "success",
  head_branch: "main",
  head_sha: sha,
  event: "push",
};
const record = {
  schema: 1,
  runId: "123",
  worker: "slice-launcher",
  verified: true,
  source: sha,
  digest: "b".repeat(64),
  artifactId: "456",
  artifactDigest: "d".repeat(64),
  version,
  deployment,
};

test("only the exact validated artifact can be promoted", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "slice-release-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "server"));
  await writeFile(join(root, "server", "index.js"), "export default {}");
  const files = await inventory(root);
  const manifest = {
    schema: 1,
    worker: "slice-launcher",
    source: sha,
    files,
    digest: digest(files),
  };
  await checkArtifact(root, manifest, sha, manifest.digest);
  await assert.rejects(
    checkArtifact(root, manifest, sha, "f".repeat(64)),
    /validated content digest/,
  );
  await assert.rejects(checkArtifact(root, manifest, "c".repeat(40)), /source mismatch/);
  await writeFile(join(root, "server", "index.js"), "changed");
  await assert.rejects(checkArtifact(root, manifest, sha), /contents changed/);
});

test("release rejects synthetic identity harnesses, environment files, and symlinks", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "slice-release-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "index.js"), "slice-e2e-only");
  await assert.rejects(inventory(root), /Test identity harness/);
  await writeFile(join(root, "index.js"), "safe");
  await writeFile(join(root, ".dev.vars"), "secret");
  await assert.rejects(inventory(root), /Secret environment file/);
  await rm(join(root, ".dev.vars"));
  await symlink("index.js", join(root, "link.js"));
  await assert.rejects(inventory(root), /symlinks/);
});

test("rollback resolves only a verified release from a successful main deployment", () => {
  assert.equal(validateVerifiedRelease(record, run, repository).version, version);
  for (const changed of [
    { conclusion: "failure" },
    { path: ".github/workflows/ci.yml" },
    { head_branch: "feature" },
    { head_sha: "c".repeat(40) },
    { event: "pull_request" },
    { id: 124 },
    { status: "in_progress" },
  ])
    assert.throws(() => validateVerifiedRelease(record, { ...run, ...changed }, repository));
  for (const changed of [
    { verified: false },
    { version: "--malicious" },
    { worker: "another-worker" },
    { digest: "invalid" },
    { deployment: "invalid" },
  ])
    assert.throws(() => validateVerifiedRelease({ ...record, ...changed }, run, repository));
});

test("deployment verification rejects mixed traffic or a different rollback version", () => {
  const state = { id: deployment, versions: [{ version_id: version, percentage: 100 }] };
  assert.equal(validateDeployment(state, version), version);
  assert.throws(() => validateDeployment(state, deployment), /Unexpected active/);
  assert.throws(
    () => validateDeployment({ ...state, versions: [{ version_id: version, percentage: 50 }] }),
    /100 percent/,
  );
  assert.throws(
    () => validateDeployment({ ...state, versions: [...state.versions, ...state.versions] }),
    /one fully/,
  );
});

test("source-run gate rejects wrong, fork, PR, failed and incomplete runs before artifact access", () => {
  assert.equal(validateSourceRun(run, repository), run);
  for (const changed of [
    { repository: { full_name: "attacker/slice-launcher" } },
    { head_repository: { full_name: "attacker/slice-launcher" } },
    { event: "pull_request" },
    { event: "pull_request_target" },
    { conclusion: "failure" },
    { conclusion: null },
    { status: "in_progress" },
    { path: ".github/workflows/ci.yml" },
    { head_branch: "feature" },
  ])
    assert.throws(() => validateSourceRun({ ...run, ...changed }, repository));
});

async function provenanceFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "slice-rollback-artifact-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "verified-release.json"), JSON.stringify(record));
  await writeFile(
    join(directory, "release-manifest.json"),
    JSON.stringify({
      schema: 1,
      worker: record.worker,
      source: record.source,
      digest: record.digest,
    }),
  );
  await writeFile(
    join(directory, "deployment.json"),
    JSON.stringify({
      id: deployment,
      versions: [{ version_id: version, percentage: 100 }],
    }),
  );
  return directory;
}

test("isolated rollback artifact accepts only bounded ordinary expected JSON files", async (t) => {
  const directory = await provenanceFixture(t);
  assert.equal((await loadRollbackProvenance(directory, run, repository)).version, version);
  await mkdir(join(directory, "scripts"));
  await writeFile(
    join(directory, "scripts", "release-provenance.mjs"),
    "throw Error('attacker code')",
  );
  await assert.rejects(
    loadRollbackProvenance(directory, run, repository),
    /Unexpected provenance artifact files/,
  );
  await rm(join(directory, "scripts"), { recursive: true });
  await writeFile(join(directory, "package.json"), '{"scripts":{"install":"malicious"}}');
  await assert.rejects(
    loadRollbackProvenance(directory, run, repository),
    /Unexpected provenance artifact files/,
  );
  await rm(join(directory, "package.json"));
  await rm(join(directory, "verified-release.json"));
  await symlink("release-manifest.json", join(directory, "verified-release.json"));
  await assert.rejects(loadRollbackProvenance(directory, run, repository), /ordinary|ELOOP/);
  await rm(join(directory, "verified-release.json"));
  await writeFile(join(directory, "verified-release.json"), " ".repeat(2 * 1024 * 1024 + 1));
  await assert.rejects(loadRollbackProvenance(directory, run, repository), /size limit/);
});

test("isolated rollback record must agree with deployment and artifact source", async (t) => {
  const directory = await provenanceFixture(t);
  await writeFile(
    join(directory, "deployment.json"),
    JSON.stringify({
      id: deployment,
      versions: [{ version_id: deployment, percentage: 100 }],
    }),
  );
  await assert.rejects(
    loadRollbackProvenance(directory, run, repository),
    /Unexpected active Worker version/,
  );
  await writeFile(
    join(directory, "release-manifest.json"),
    JSON.stringify({
      schema: 1,
      worker: record.worker,
      source: "c".repeat(40),
      digest: record.digest,
    }),
  );
  await assert.rejects(loadRollbackProvenance(directory, run, repository));
});

test("release file reads reject non-files and enforce the byte bound", async (t) => {
  const { readReleaseFile } = await import("./read-release-file.mjs");
  const root = await mkdtemp(join(tmpdir(), "slice-file-read-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(readReleaseFile(root), /ordinary/);
  const path = join(root, "file");
  await writeFile(path, "bounded");
  assert.equal((await readReleaseFile(path, 7)).toString(), "bounded");
  await assert.rejects(readReleaseFile(path, 6), /size limit/);
});
