import { describe, expect, it } from "vitest";
import { decode } from "@toon-format/toon";
import type { CaseReference } from "mingli-cases-react";
import { buildExportAiText, buildExportData, buildExportMd, buildExportToon } from "./exportData";
import { appendCaseReference, CASE_REFERENCE_BOUNDARY } from "./caseReference";
import { makeZwdsFixture } from "./testFixtures";

const reference: CaseReference = {
  caseId: "source:7", title: "独立来源案例", text: "原题：职业？\n来源答案：教师。",
  sourceUrl: "https://example.com/case-7", sourceRevision: "revision-a", collectionId: "source", mode: "reference",
};

describe("独立命例参考", () => {
  const z = makeZwdsFixture();
  it("JSON/TOON 保留命主字段，不把案例写入出生参数、量化数据或个人档案", () => {
    const before = JSON.stringify(z.input);
    const plain = buildExportData(z)!;
    const selected = buildExportData(z, { caseReference: reference })!;
    expect(selected.input).toEqual(plain.input);
    expect(selected.basic).toEqual(plain.basic);
    expect(selected.caseReference).toEqual({ ...reference, boundary: CASE_REFERENCE_BOUNDARY });
    const toon = decode(buildExportToon(z, { caseReference: reference })!) as Record<string, unknown>;
    expect(toon.caseReference).toEqual(selected.caseReference);
    expect(toon.lifeKline).toBeUndefined();
    expect(JSON.stringify(z.input)).toBe(before);
    expect(buildExportData(z, { caseReference: null })).not.toHaveProperty("caseReference");
  });
  it("MD 维持原有章节，并在独立区注明来源；AI 复制同样禁止套用案例答案", () => {
    const md = buildExportMd(z, { caseReference: reference })!;
    expect(md.indexOf("命例参考资料（非当前命主事实）")).toBeGreaterThan(md.indexOf("## 附录D"));
    expect(md).toContain(reference.sourceRevision);
    expect(md).toContain(reference.text);
    const ai = buildExportAiText(z, { caseReference: reference })!;
    expect(ai).toContain("命例参考边界");
    expect(ai).toContain(CASE_REFERENCE_BOUNDARY);
    expect(ai).toContain(reference.sourceUrl);
    expect(buildExportMd(z, { caseReference: null })).not.toContain(reference.caseId);
  });
  it("合盘附录明确不属于甲乙任何一方；清除不改变原报告", () => {
    const report = "# 合盘报告\n甲方与乙方的结构事实。";
    expect(appendCaseReference(report, null)).toBe(report);
    const selected = appendCaseReference(report, reference);
    expect(selected.startsWith(report)).toBe(true);
    expect(selected).toContain("不是当前命主或合盘任一方的经历");
    expect(selected).toContain(reference.sourceRevision);
  });
});
