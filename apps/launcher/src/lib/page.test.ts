import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../../app/page";

it("shows a useful empty state before any apps are published", () => {
  const html = renderToStaticMarkup(createElement(Home));
  expect(html).toContain("Slice Consulting");
  expect(html).toContain("App Launcher");
  expect(html).toContain("No apps have been added yet");
});
