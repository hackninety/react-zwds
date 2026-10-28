import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decode } from "@toon-format/toon";

async function exported(page: Page, label: RegExp) {
  const downloaded = page.waitForEvent("download");
  await page.locator("#ai-export").getByRole("button", { name: label }).click();
  const path = await (await downloaded).path();
  return readFile(path!, "utf8");
}

test("命例按需加载，独立参考覆盖导出并在清除或换盘时失效", async ({ page }) => {
  const manifest = JSON.parse(await readFile("dist/.vite/manifest.json", "utf8"));
  const libraryFiles = Object.entries(manifest)
    .filter(([key]) => key.includes("node_modules/mingli-cases-"))
    .map(([, value]) => (value as { file: string }).file);
  expect(libraryFiles.length).toBeGreaterThan(10);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname.slice(1)));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const entry = page.getByTestId("case-library-entry");
  await expect(entry.getByRole("button", { name: "打开命例库" })).toHaveAttribute("aria-expanded", "false");
  const input = page.locator("form.input-panel");
  const birthBefore = await input.getByLabel("阳历生日").inputValue();
  const plain = decode(await exported(page, /^导出 TOON/)) as Record<string, unknown>;
  expect(requests.filter((path) => libraryFiles.includes(path))).toEqual([]);

  async function chooseReference() {
    await entry.getByRole("button", { name: "打开命例库" }).click();
    const library = page.getByRole("region", { name: "紫微命例库" });
    await library.getByLabel("命例年份").selectOption("2026");
    await library.getByLabel("命例列表").getByRole("button").first().click();
    await expect(library.getByRole("button", { name: "用于 AI 参考（含已揭晓答案）", exact: true })).toBeDisabled();
    await library.getByRole("button", { name: "用于 AI 参考（不含答案）", exact: true }).click();
    await expect(page.getByTestId("selected-case-reference")).toBeVisible();
  }

  await entry.getByRole("button", { name: "打开命例库" }).click();
  const library = page.getByRole("region", { name: "紫微命例库" });
  await library.getByLabel("命例年份").selectOption("2026");
  await library.getByLabel("命例列表").getByRole("button").first().click();
  await expect(library.getByRole("button", { name: "揭晓答案" }).first()).toBeVisible();
  expect(requests.some((path) => /\/cases-contest8_2026-/.test(path))).toBe(true);
  expect(requests.some((path) => /\/(answers|charts)-/.test(path))).toBe(false);
  await expect(library.locator(".ml-answer")).toHaveCount(0);
  const referenceWithout = library.getByRole("button", { name: "用于 AI 参考（不含答案）", exact: true });
  const referenceWith = library.getByRole("button", { name: "用于 AI 参考（含已揭晓答案）", exact: true });
  await expect(referenceWith).toBeDisabled();
  // 未揭晓时选为参考不得请求答案分块，导出也不含答案。
  await referenceWithout.click();
  await expect(page.getByTestId("selected-case-reference")).toContainText("非当前命主事实");
  expect(requests.some((path) => /\/answers-/.test(path))).toBe(false);
  const withoutAnswers = decode(await exported(page, /^导出 TOON/)) as Record<string, any>;
  expect(withoutAnswers.caseReference.caseId).toBeTruthy();
  expect(JSON.stringify(withoutAnswers.caseReference)).not.toContain("显式揭晓的原资料答案");
  await library.getByRole("button", { name: "揭晓答案" }).first().click();
  await expect(library.locator(".ml-answer").first()).toBeVisible();
  expect(requests.some((path) => /\/answers-contest8_2026-/.test(path))).toBe(true);
  await referenceWith.click();
  await expect(page.getByTestId("selected-case-reference")).toContainText("非当前命主事实");
  await expect(input.getByLabel("阳历生日")).toHaveValue(birthBefore);
  const selected = decode(await exported(page, /^导出 TOON/)) as Record<string, any>;
  expect(JSON.stringify(selected.caseReference)).toContain("显式揭晓的原资料答案");
  expect(selected.input).toEqual(plain.input);
  expect(selected.basic).toEqual(plain.basic);
  expect(selected.caseReference.caseId).toBeTruthy();
  expect(selected.caseReference.boundary).toContain("不是当前命主或合盘任一方");
  const md = await exported(page, /^导出 MD/);
  expect(md).toContain("命例参考资料（非当前命主事实）");
  expect(md).toContain(selected.caseReference.sourceRevision);
  await page.locator("#ai-export").getByRole("button", { name: /^复制给 AI/ }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("命例参考边界");

  // 剪贴板权限尚未完成时清除，拒绝后不能再降级下载旧参考。
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: () => new Promise<void>((_resolve, reject) => {
      (window as any).__rejectClipboard = reject;
    }) });
  });
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await page.locator("#ai-export .export-primary").click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__rejectClipboard)).toBe("function");
  await page.getByTestId("selected-case-reference").getByRole("button", { name: "清除参考" }).click();
  await page.evaluate(async () => { (window as any).__rejectClipboard(new Error("模拟权限拒绝")); await new Promise(requestAnimationFrame); });
  expect(downloads).toEqual([]);
  await expect(page.getByTestId("selected-case-reference")).toHaveCount(0);
  const cleared = decode(await exported(page, /^导出 TOON/)) as Record<string, unknown>;
  expect(cleared).not.toHaveProperty("caseReference");

  await chooseReference();
  await input.getByLabel("阳历生日").fill("2001-08-16");
  await input.getByRole("button", { name: "起 盘", exact: true }).click();
  await expect(page.getByTestId("selected-case-reference")).toHaveCount(0);
  const changed = decode(await exported(page, /^导出 TOON/)) as Record<string, unknown>;
  expect(changed).not.toHaveProperty("caseReference");
  expect(JSON.stringify(changed.input)).toContain("2001-08-16");

  // 合盘走独立 Markdown 入口，也必须保留边界并在乙方重新起盘时清除。
  await page.evaluate(() => { delete (navigator.clipboard as any).writeText; });
  await page.getByRole("button", { name: "合盘", exact: true }).click();
  const synastry = page.locator("#synastry");
  await synastry.getByRole("button", { name: "合 盘", exact: true }).click();
  await chooseReference();
  await synastry.getByRole("button", { name: "复制合盘报告", exact: true }).click();
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain("命例参考资料（非当前命主事实）");
  expect(report).toContain("不是当前命主或合盘任一方");
  await synastry.getByRole("button", { name: "合 盘", exact: true }).click();
  await expect(page.getByTestId("selected-case-reference")).toHaveCount(0);
  expect(errors).toEqual([]);
});
