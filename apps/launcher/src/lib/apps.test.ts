import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppTile } from "@slice/ui";
import { getPublicAppUrl } from "./apps";

const entry = {
  id: "alumni",
  name: "Alumni Database",
  description: "Browse approved alumni records",
};

describe("getPublicAppUrl", () => {
  it("returns a valid HTTPS app URL", () => {
    expect(getPublicAppUrl({ ...entry, url: "https://alumni.example.org" })).toBe(
      "https://alumni.example.org/",
    );
  });

  it.each([
    undefined,
    "",
    "http://alumni.example.org",
    "javascript:alert(1)",
    "data:text/html,hi",
    "not a URL",
    "https://user:pass@alumni.example.org",
  ])("rejects an unavailable or unsafe URL: %s", (url) => {
    expect(getPublicAppUrl({ ...entry, url })).toBeNull();
  });
});

describe("AppTile", () => {
  it("renders a safe link for an available app", () => {
    const html = renderToStaticMarkup(
      createElement(AppTile, {
        name: entry.name,
        description: entry.description,
        href: "https://alumni.example.org/",
      }),
    );
    expect(html).toContain('href="https://alumni.example.org/"');
    expect(html).toContain("Alumni Database");
  });

  it("shows unavailable text without a link when an app has no URL", () => {
    const html = renderToStaticMarkup(
      createElement(AppTile, {
        name: entry.name,
        description: entry.description,
        href: null,
      }),
    );
    expect(html).not.toMatch(/<a(?:\s|>)/);
    expect(html).toContain("Coming soon");
  });
});
