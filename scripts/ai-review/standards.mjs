import { readFile } from "node:fs/promises";
import { text } from "./core.mjs";

export async function loadStandards(read = readFile) {
  const paths = [
    "CONTRIBUTING.md",
    "docs/architecture.md",
    "docs/security-review.md",
    "docs/data-boundary.md",
  ];
  const contents = await Promise.all(
    paths.map(async (path) => {
      const content = await read(path, "utf8");
      if (!content.trim()) throw new Error("Required trusted standards empty");
      return path + "\n" + content;
    }),
  );
  return text(contents.join("\n"), 30000);
}
