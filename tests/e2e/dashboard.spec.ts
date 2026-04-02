import { expect, test } from "@playwright/test";

import { loadFixtureReport } from "../support/fixtures.ts";
import { flattenTree, uniqueHistoryLanguages } from "../support/report.ts";

const routes = [
  ["/", "Repo Activity"],
  ["/hotspots", "Complexity vs Churn"],
  ["/bus-factor", "Ownership Landscape"],
  ["/age", "Median Line Age"],
  ["/coupling", "Co-change Graph"],
  ["/loc", "LOC Over Time"],
  ["/authors", "Contribution Heatmap"],
  ["/commits", "Commit Timeline"],
  ["/explorer", "Repository Explorer"],
] as const;

test.describe("dashboard", () => {
  test("renders all nine pages without console errors", async ({ page }) => {
    const report = await loadFixtureReport();
    const messages: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        messages.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      messages.push(error.message);
    });

    await page.route("**/report.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(report),
      });
    });

    for (const [route, label] of routes) {
      await page.goto(route);
      await expect(page.getByText(label)).toBeVisible();
    }

    expect(messages).toEqual([]);
  });

  test("D3 charts render the same number of elements as the data they consume", async ({
    page,
  }) => {
    const report = await loadFixtureReport();
    const flattenedTree = flattenTree(report.fileTree);
    const expectedLanguages = uniqueHistoryLanguages(report.loc.history);
    const filteredCouplings = report.coupling.edges.filter(
      (edge) => edge.strength >= 0.3,
    );

    await page.route("**/report.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(report),
      });
    });

    await page.goto("/hotspots");
    await expect(page.locator("svg circle[style*='cursor: pointer']")).toHaveCount(
      report.hotspots.length,
    );

    await page.goto("/bus-factor");
    await expect(page.locator("svg path[style*='cursor: pointer']")).toHaveCount(
      flattenedTree.length,
    );

    await page.goto("/age");
    await expect(page.locator("svg rect")).toHaveCount(flattenedTree.length);

    await page.goto("/coupling");
    await expect(page.locator("svg line")).toHaveCount(filteredCouplings.length);
    await expect(page.locator("svg g[style*='cursor: grab'] circle")).toHaveCount(
      report.coupling.nodes.length,
    );

    await page.goto("/loc");
    await expect(page.locator("svg path[fill]")).toHaveCount(
      expectedLanguages.length,
    );

    await page.goto("/");
    await expect(page.locator("svg rect")).toHaveCount(
      report.summary.activityHeatmap.length,
    );
  });
});
