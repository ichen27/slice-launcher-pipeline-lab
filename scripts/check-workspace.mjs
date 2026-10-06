import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";

export function checkAppScripts(root) {
  const errors = [];
  for (const app of readdirSync(join(root, "apps"), { withFileTypes: true })) {
    if (!app.isDirectory()) continue;
    const manifestPath = join("apps", app.name, "package.json");
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));
    } catch {
      errors.push(`${manifestPath}: missing or invalid package.json`);
      continue;
    }
    for (const command of ["lint", "typecheck", "test", "build"]) {
      if (typeof manifest.scripts?.[command] !== "string" || !manifest.scripts[command].trim()) {
        errors.push(`${manifestPath}: requires a nonempty ${command} script`);
      }
    }
    const readmePath = join(root, "apps", app.name, "README.md");
    try {
      const readme = readFileSync(readmePath, "utf8");
      for (const heading of ["Configuration", "Permissions", "Deployment", "Testing"]) {
        if (!new RegExp(`^## ${heading}\\s*$`, "m").test(readme))
          errors.push(`${readmePath}: requires a ${heading} section`);
      }
    } catch {
      errors.push(`${readmePath}: required app documentation is missing`);
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkAppScripts(fileURLToPath(new URL("../", import.meta.url)));
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("All apps declare lint, typecheck, test, and build checks.");
  }
}
