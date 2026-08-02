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

  it("旧版本存档缺新增字段：读取侧补默认值（防四化表/盘型 undefined 渗入排盘）", () => {
    const s = memStore();
    // 模拟早期版本仅有基础字段的存档条目
    const legacy = {
      name: "旧档",
      savedAt: 1,
      input: {
        name: "旧档",
        gender: "女",
        calendar: "solar",
        date: "1995-05-05",
        timeIndex: 8,
        isLeapMonth: false,
      },
    };
    s.setItem("zwds-archive-v1", JSON.stringify([legacy]));
    const e = listArchive(s)[0];
    expect(e.input.mutagenTable).toBe("default");
    expect(e.input.astroType).toBe("heaven");
    expect(e.input.algorithm).toBe("default");
    expect(e.input.dayDivide).toBe("forward");
    expect(e.input.useTrueSolar).toBe(false);
    // 原有字段不被默认值覆盖
    expect(e.input.gender).toBe("女");
    expect(e.input.date).toBe("1995-05-05");
    expect(e.input.timeIndex).toBe(8);
  });
});
