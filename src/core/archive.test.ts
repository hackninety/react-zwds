/** 多盘档案册测试（注入内存存储） */
import { describe, expect, it } from "vitest";
import { getFromArchive, listArchive, removeFromArchive, saveToArchive } from "./archive";
import type { BirthInput } from "./useZwds";

function memStore(): Pick<Storage, "getItem" | "setItem"> {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  };
}

const input = (name: string): BirthInput => ({
  name,
  gender: "男",
  calendar: "solar",
  date: "2000-08-16",
  timeIndex: 2,
  isLeapMonth: false,
  exactTime: "",
  useTrueSolar: false,
  placeMode: "china",
  province: "北京",
  city: "北京",
  district: "市区",
  timezone: "",
  algorithm: "default",
  yearDivide: "normal",
  mutagenTable: "default",
  dayDivide: "forward",
  astroType: "heaven",
  residence: "",
});

describe("archive 多盘档案", () => {
  it("保存/读取/删除，按姓名索引", () => {
    const s = memStore();
    expect(listArchive(s)).toEqual([]);
    saveToArchive(input("甲"), s);
    saveToArchive(input("乙"), s);
    expect(listArchive(s).map((e) => e.name)).toEqual(["乙", "甲"]);
    expect(getFromArchive("甲", s)?.input.date).toBe("2000-08-16");
    removeFromArchive("甲", s);
    expect(listArchive(s).map((e) => e.name)).toEqual(["乙"]);
  });

  it("同名覆盖并置顶", () => {
    const s = memStore();
    saveToArchive(input("甲"), s);
    saveToArchive(input("乙"), s);
    saveToArchive({ ...input("甲"), date: "1999-01-01" }, s);
    const list = listArchive(s);
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("甲");
    expect(list[0].input.date).toBe("1999-01-01");
  });

  it("空名按「无名」，上限 50 条", () => {
    const s = memStore();
    saveToArchive(input(""), s);
    expect(listArchive(s)[0].name).toBe("无名");
    for (let i = 0; i < 60; i++) saveToArchive(input(`人${i}`), s);
    expect(listArchive(s)).toHaveLength(50);
  });

  it("损坏数据兜底为空", () => {
    const s = memStore();
    s.setItem("zwds-archive-v1", "{broken");
    expect(listArchive(s)).toEqual([]);
    s.setItem("zwds-archive-v1", JSON.stringify({ not: "array" }));
    expect(listArchive(s)).toEqual([]);
  });
});
