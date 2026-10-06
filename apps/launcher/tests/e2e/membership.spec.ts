import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { identityToken } from "./identity";

async function signedPage(browser: Browser, email: string) {
  const context = await browser.newContext({
    extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": await identityToken(email) },
  });
  const page = await context.newPage();
  await page.goto("/account");
  return { context, page };
}
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
  ).toEqual([]);
}
async function saveAccess(page: Page) {
  await page.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
}
test("onboarding, approval, persistent profile, permission changes, revocation and suspension", async ({
  browser,
}) => {
  const { context: memberContext, page: member } = await signedPage(browser, "member@example.test");
  const { context: ownerContext, page: owner } = await signedPage(browser, "owner@example.test");
  try {
    await expect(member.getByRole("heading", { name: "Create your member profile" })).toBeVisible();
    await accessible(member);
    await member.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(member.getByText("Pending approval", { exact: true })).toBeVisible();
    await expect(member.getByRole("button", { name: "Members", exact: true })).toHaveCount(0);
    expect((await memberContext.request.get("/api/membership?view=history")).status()).toBe(403);
    const pending = await (await memberContext.request.get("/api/membership")).json();
    expect(
      (
        await memberContext.request.post("/api/membership", {
          headers: { origin: "http://127.0.0.1:4173" },
          data: {
            revision: pending.revision,
            command: { type: "level.save", name: "Escalation", permissions: ["members.manage"] },
          },
        })
      ).status(),
    ).toBe(403);
    await member.getByLabel("Name", { exact: true }).fill("Synthetic Member");
    await member.getByLabel("Title or role").fill("Consultant");
    await member.getByRole("button", { name: "Save profile" }).click();
    await expect(member.getByRole("status")).toHaveText("Changes saved.");
    await member.reload();
    await expect(member.getByLabel("Name", { exact: true })).toHaveValue("Synthetic Member");
    await expect(member.getByLabel("Email", { exact: true })).toHaveAttribute("readonly", "");
    await accessible(member);

    await owner.getByRole("button", { name: "Continue", exact: true }).click();
    await owner.getByRole("button", { name: "Members", exact: true }).click();
    await owner.getByRole("button", { name: /Synthetic Member member@example.test/ }).click();
    await owner.getByRole("combobox", { name: /^Status/ }).selectOption("active");
    await owner.getByRole("combobox", { name: /^Access level/ }).selectOption("member");
    await accessible(owner);
    await saveAccess(owner);
    await member.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(member.getByText("active", { exact: true })).toBeVisible();
    await member.getByRole("button", { name: "Members", exact: true }).click();
    await expect(member.getByText("Synthetic Member", { exact: true })).toBeVisible();
    expect(
      (await (await memberContext.request.get("/api/membership")).json()).members.every(
        (entry: Record<string, unknown>) => !("email" in entry),
      ),
    ).toBe(true);

    await owner.getByRole("button", { name: "Access levels", exact: true }).click();
    await owner.getByRole("button", { name: "Create access level", exact: true }).click();
    await owner.getByLabel("Name", { exact: true }).fill("History reader");
    await owner.getByLabel("View member directory", { exact: true }).check();
    await owner.getByLabel("View access history", { exact: true }).check();
    await owner.getByRole("button", { name: "Create access level", exact: true }).last().click();
    await expect(owner.getByRole("status")).toHaveText("Changes saved.");
    await owner.getByRole("button", { name: "Members", exact: true }).click();
    await owner.getByRole("button", { name: /Synthetic Member member@example.test/ }).click();
    await owner
      .getByRole("combobox", { name: /^Access level/ })
      .selectOption({ label: "History reader" });
    await saveAccess(owner);
    expect((await memberContext.request.get("/api/membership?view=history")).status()).toBe(200);
    await member.getByRole("button", { name: "Refresh", exact: true }).click();
    await member.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(member.getByRole("heading", { name: "Recent activity" })).toBeVisible();

    await owner.locator('input[name="deny"][value="audit.read"]').check();
    await saveAccess(owner);
    expect((await memberContext.request.get("/api/membership?view=history")).status()).toBe(403);
    await member.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(member.getByRole("button", { name: "Activity", exact: true })).toHaveCount(0);
    await owner.getByRole("combobox", { name: /^Status/ }).selectOption("suspended");
    await saveAccess(owner);
    await member.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(member.getByRole("button", { name: "Save profile" })).toBeDisabled();
    await expect(member.getByRole("button", { name: "Members", exact: true })).toHaveCount(0);
    const suspended = await (await memberContext.request.get("/api/membership")).json();
    expect(suspended.permissions).toEqual([]);
    expect(
      (
        await memberContext.request.post("/api/membership", {
          headers: { origin: "http://127.0.0.1:4173" },
          data: {
            revision: suspended.revision,
            command: { type: "profile.update", name: "Unauthorized", title: "" },
          },
        })
      ).status(),
    ).toBe(403);
    await member.getByRole("link", { name: "Applications", exact: true }).click();
    await expect(member.getByRole("heading", { name: "Applications", exact: true })).toBeVisible();
    await accessible(member);
    await member.getByRole("link", { name: /Synthetic Member/ }).click();
    await expect(member.getByText("suspended", { exact: true })).toBeVisible();
  } finally {
    await Promise.allSettled([memberContext.close(), ownerContext.close()]);
  }
});
test("unsigned, tampered and service identities cannot read membership or protected views", async ({
  browser,
  request,
  page,
}) => {
  expect((await request.get("/api/membership")).status()).toBe(401);
  const valid = await identityToken("tampered@example.test");
  for (const token of [
    "unsigned",
    valid.slice(0, -10) + "xxxxxxxxxx",
    await identityToken("service@example.test", { common_name: "synthetic-service" }),
  ]) {
    expect(
      (
        await request.get("/api/membership?view=history", {
          headers: { "Cf-Access-Jwt-Assertion": token },
        })
      ).status(),
    ).toBe(401);
  }
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Sign in to Slice" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Members", exact: true })).toHaveCount(0);
  await accessible(page);
  const { context, page: unrelated } = await signedPage(browser, "unrelated@example.test");
  await expect(
    unrelated.getByRole("heading", { name: "Create your member profile" }),
  ).toBeVisible();
  await context.close();
});
