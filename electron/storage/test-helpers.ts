import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  openTestLibrary,
  type TestLibrary,
  type TestLibraryOptions as Options,
} from "./test-library.ts";

const roots: string[] = [];
const libraries = new Set<TestLibrary>();
const databases = new Set<DatabaseSync>();

export async function trackedLibrary(path: string, options: Options = {}) {
  const library = await openTestLibrary(path, options);
  libraries.add(library);
  return library;
}

export async function closeLibrary(library: TestLibrary) {
  libraries.delete(library);
  await library.close();
}

export function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "inkling-electron-storage-"));
  roots.push(root);
  return root;
}

export async function temporaryLibrary(options: Options = {}) {
  const root = temporaryRoot();
  return { root, library: await trackedLibrary(join(root, "library.sqlite3"), options) };
}

export function trackDatabase(database: DatabaseSync) {
  databases.add(database);
  return database;
}

export function closeDatabase(database: DatabaseSync) {
  databases.delete(database);
  database.close();
}

export async function closeAll() {
  for (const library of libraries) await library.close();
  libraries.clear();
  for (const database of databases) database.close();
  databases.clear();
  Bun.gc(true);
}

export function removeTemporaryRoots() {
  Bun.gc(true);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

export const count = (library: TestLibrary, table: string) =>
  Number(library.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count);

export const ids = (items: { id: string }[]) => items.map((item) => item.id);

export function vector(values: number[]) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => {
    bytes.writeFloatLE(value, index * 4);
  });
  return bytes;
}
