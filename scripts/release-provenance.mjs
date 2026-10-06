import { readReleaseFile } from "./read-release-file.mjs";
import assert from "node:assert/strict";
import { readFile, writeFile, appendFile, lstat, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { join } from "node:path";

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export function validateDeployment(deployment, expectedVersion) {
  assert.match(deployment.id, uuid, "Invalid deployment ID");
  assert.equal(deployment.versions?.length, 1, "Expected one fully deployed version");
  const version = deployment.versions[0];
  assert.match(version.version_id, uuid, "Invalid Worker version");
  assert.equal(version.percentage, 100, "Expected 100 percent traffic");
  if (expectedVersion)
    assert.equal(version.version_id, expectedVersion, "Unexpected active Worker version");
  return version.version_id;
}
export function validateSourceRun(run, repository) {
  assert.match(repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Expected repository is required");
  assert.equal(run.repository?.full_name, repository, "Run must belong to this repository");
  assert.equal(
    run.head_repository?.full_name,
    repository,
    "Fork runs cannot supply recovery artifacts",
  );
  assert.ok(Number.isSafeInteger(run.id) && run.id > 0, "Invalid run ID");
  assert.match(run.head_sha, /^[0-9a-f]{40}$/);

  assert.equal(run.conclusion, "success", "Only successful release runs may be restored");
  assert.equal(run.status, "completed");
  assert.equal(run.path, ".github/workflows/deploy-launcher.yml");
  assert.equal(run.head_branch, "main");
  assert.ok(["push", "workflow_dispatch"].includes(run.event));
  return run;
}
export function validateVerifiedRelease(record, run, repository) {
  validateSourceRun(run, repository);
  assert.equal(record.runId, String(run.id));
  assert.equal(record.source, run.head_sha);
  assert.equal(record.schema, 1);
  assert.equal(record.worker, "slice-launcher");
  assert.equal(record.verified, true);
  assert.match(record.source, /^[0-9a-f]{40}$/);
  assert.match(record.digest, /^[0-9a-f]{64}$/);
  assert.match(record.artifactId, /^[1-9][0-9]*$/);
  assert.match(record.artifactDigest, /^[0-9a-f]{64}$/);
  assert.match(record.version, uuid);
  assert.match(record.deployment, uuid);
  return record;
}
export async function loadRollbackProvenance(directory, run, repository) {
  validateSourceRun(run, repository);
  const directoryStat = await lstat(directory);
  assert.ok(
    directoryStat.isDirectory() && !directoryStat.isSymbolicLink(),
    "Provenance directory must be ordinary",
  );
  const expected = ["deployment.json", "release-manifest.json", "verified-release.json"];
  assert.deepEqual(
    (await readdir(directory)).sort(),
    expected,
    "Unexpected provenance artifact files",
  );
  const data = {};
  for (const name of expected) {
    const path = join(directory, name);
    const contents = await readReleaseFile(path, 2 * 1024 * 1024);
    assert.ok(contents.length > 0, "Provenance JSON must not be empty");
    data[name] = JSON.parse(contents.toString("utf8"));
  }
  const record = validateVerifiedRelease(data["verified-release.json"], run, repository);
  const manifest = data["release-manifest.json"];
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.worker, record.worker);
  assert.equal(manifest.source, record.source);
  assert.equal(manifest.digest, record.digest);
  const deployment = data["deployment.json"];
  assert.equal(deployment.id, record.deployment);
  validateDeployment(deployment, record.version);
  return record;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [mode] = process.argv.slice(2);
  if (mode === "record") {
    const manifest = JSON.parse(await readFile("release-manifest.json", "utf8"));
    const deployment = JSON.parse(await readFile("deployment.json", "utf8"));
    const output = (await readFile("wrangler-output.ndjson", "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    const deployed = output
      .filter((row) => row.type === "deploy" && row.worker_name === "slice-launcher")
      .at(-1);
    assert.ok(deployed, "Missing Wrangler deploy record");
    const version = validateDeployment(deployment, deployed.version_id);
    assert.equal(manifest.source, process.env.GITHUB_SHA);
    await writeFile(
      "verified-release.json",
      JSON.stringify(
        {
          schema: 1,
          worker: "slice-launcher",
          verified: true,
          source: manifest.source,
          digest: manifest.digest,
          runId: process.env.GITHUB_RUN_ID,
          artifactId: process.env.RELEASE_ARTIFACT_ID,
          artifactDigest: process.env.RELEASE_ARTIFACT_DIGEST,
          version,
          deployment: deployment.id,
          verifiedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
  } else if (mode === "source-run") {
    const run = validateSourceRun(
      JSON.parse(await readFile(process.env.VERIFIED_RUN_PATH, "utf8")),
      process.env.GITHUB_REPOSITORY,
    );
    assert.equal(String(run.id), process.env.VERIFIED_RUN_ID);
  } else if (mode === "rollback-target") {
    const record = await loadRollbackProvenance(
      process.env.PROVENANCE_DIRECTORY,
      JSON.parse(await readFile(process.env.VERIFIED_RUN_PATH, "utf8")),
      process.env.GITHUB_REPOSITORY,
    );
    await appendFile(
      process.env.GITHUB_OUTPUT,
      "version=" + record.version + "\nsource=" + record.source + "\n",
    );
  } else if (mode === "check-rollback") {
    validateDeployment(
      JSON.parse(await readFile("deployment.json", "utf8")),
      process.env.EXPECTED_VERSION,
    );
  } else throw new Error("Unknown provenance operation");
}
