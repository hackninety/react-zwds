/**
 * 多盘档案册：把多份起盘参数存入 localStorage，按姓名索引（同名覆盖）。
 * 主输入面板可保存/切换/删除；合盘乙方可直接从档案取人。
 */
import type { BirthInput } from "./useZwds";

export type ArchiveEntry = {
  name: string;
  savedAt: number;
  input: BirthInput;
};

const KEY = "zwds-archive-v1";
const MAX = 50;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStore(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function listArchive(s: StorageLike | null = defaultStore()): ArchiveEntry[] {
  try {
    const raw = s?.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ArchiveEntry[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e && typeof e.name === "string" && e.name && e.input);
  } catch {
    return [];
  }
}

/** 保存（同名覆盖，置顶），返回新列表 */
export function saveToArchive(input: BirthInput, s: StorageLike | null = defaultStore()): ArchiveEntry[] {
  const name = (input.name || "").trim() || "无名";
  const list = listArchive(s).filter((e) => e.name !== name);
  list.unshift({ name, savedAt: Date.now(), input: { ...input, name } });
  const trimmed = list.slice(0, MAX);
  try {
    s?.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* 存储不可用时静默 */
  }
  return trimmed;
}

export function removeFromArchive(name: string, s: StorageLike | null = defaultStore()): ArchiveEntry[] {
  const list = listArchive(s).filter((e) => e.name !== name);
  try {
    s?.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

export function getFromArchive(name: string, s: StorageLike | null = defaultStore()): ArchiveEntry | null {
  return listArchive(s).find((e) => e.name === name) ?? null;
}
