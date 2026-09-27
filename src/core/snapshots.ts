/**
 * Named snapshots in `storage.local`, tasks T-401 to T-403 and T-405.
 *
 * Two keys per snapshot, deliberately. `snapshots` holds only the metadata, so
 * listing fifty of them reads a few kilobytes rather than five megabytes, and
 * each `snapshot:<id>` holds one pack. ADR-007 rules out `storage.sync`: its
 * quota cannot hold a session, and splitting a snapshot across both stores would
 * invent a way to be half synced.
 *
 * Nothing here deletes anything on its own. ADR-012: the cap is soft, the
 * warning is loud, and the user decides. A tool whose job is not losing tabs
 * does not get to throw tabs away to make room.
 */
import type { BrowserAdapter } from "./adapter/types.js";
import type { Session } from "../types/session.js";
import { countSession } from "../types/session.js";
import type { TabsPackFile } from "../types/tabspack.js";
import { stringify, toFile } from "./serialize.js";
import { fromFile } from "./deserialize.js";

export const INDEX_KEY = "snapshots";
export const BODY_PREFIX = "snapshot:";

/**
 * The smallest quota TabsPack can expect: Chromium gives `storage.local` ten
 * megabytes without the unlimitedStorage permission, which this extension does
 * not ask for. Gecko is more generous, and a browser that reports its own usage
 * is believed over this number.
 */
export const SOFT_CAP_BYTES = 10 * 1024 * 1024;
export const WARN_AT = 0.8;

export interface SnapshotMeta {
  id: string;
  name: string;
  tags: string[];
  /** ISO 8601 with offset, the same spelling the file format uses. */
  createdAt: string;
  updatedAt: string;
  counts: { windows: number; tabs: number; groups: number };
  /** Size of the stored pack in bytes, so usage can be reported without reading it. */
  bytes: number;
}

export interface Usage {
  bytes: number;
  cap: number;
  fraction: number;
  /** True past the soft cap's warning line. Nothing is ever deleted because of it. */
  warn: boolean;
  /** True when the browser reported the figure rather than it being added up. */
  measured: boolean;
}

export interface SaveOptions {
  name: string;
  tags?: string[];
  /** Overrides the clock and the id, for tests. */
  now?: Date;
  id?: string;
}

export interface SnapshotWriteResult {
  meta: SnapshotMeta;
  usage: Usage;
}

/** A name a person can find again, when they did not type one. */
export function defaultSnapshotName(when: Date, counts: { windows: number; tabs: number }): string {
  const date = when.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
  return `${date} ${time}, ${counts.tabs} ${counts.tabs === 1 ? "tab" : "tabs"}`;
}

export async function listSnapshots(adapter: BrowserAdapter): Promise<SnapshotMeta[]> {
  const stored = await adapter.storageGet({ [INDEX_KEY]: [] as unknown[] });
  const raw = stored[INDEX_KEY];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((entry): entry is SnapshotMeta => isMeta(entry))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The pack is written before the index entry that names it. A crash between the
 * two leaves an orphan body, which `sweepOrphans` clears; the other order would
 * leave the list advertising a snapshot that cannot be opened.
 */
export async function saveSnapshot(
  adapter: BrowserAdapter,
  session: Session,
  options: SaveOptions,
): Promise<SnapshotWriteResult> {
  const when = options.now ?? new Date();
  const id = options.id ?? newId();
  const file = toFile(session, { keepFavicons: false, exportedAt: when, name: options.name });
  const text = stringify(file);

  await adapter.storageSet({ [BODY_PREFIX + id]: text });

  const counts = countSession(session);
  const meta: SnapshotMeta = {
    id,
    name: options.name,
    tags: [...(options.tags ?? [])],
    createdAt: isoOf(when),
    updatedAt: isoOf(when),
    counts,
    bytes: byteLength(text),
  };

  await writeIndex(adapter, (list) => [meta, ...list.filter((entry) => entry.id !== id)]);
  return { meta, usage: await usage(adapter) };
}

export async function readSnapshot(adapter: BrowserAdapter, id: string): Promise<TabsPackFile | null> {
  const key = BODY_PREFIX + id;
  const stored = await adapter.storageGet({ [key]: "" });
  const text = stored[key];
  if (typeof text !== "string" || text === "") return null;
  try {
    return JSON.parse(text) as TabsPackFile;
  } catch {
    return null;
  }
}

/** The stored text exactly as it will be written to a file, for T-403. */
export async function readSnapshotText(adapter: BrowserAdapter, id: string): Promise<string | null> {
  const key = BODY_PREFIX + id;
  const stored = await adapter.storageGet({ [key]: "" });
  const text = stored[key];
  return typeof text === "string" && text !== "" ? text : null;
}

export async function readSnapshotSession(adapter: BrowserAdapter, id: string): Promise<Session | null> {
  const file = await readSnapshot(adapter, id);
  if (!file) return null;
  return fromFile(file).session;
}

export async function renameSnapshot(
  adapter: BrowserAdapter,
  id: string,
  name: string,
  now?: Date,
): Promise<SnapshotMeta | null> {
  // Naming an automatic snapshot is choosing to keep it, so it leaves the
  // rolling series and is never removed by it: ADR-047.
  return await editMeta(adapter, id, (meta) => ({
    ...meta,
    name,
    tags: meta.tags.filter((tag) => tag !== "auto"),
    updatedAt: isoOf(now ?? new Date()),
  }));
}

export async function tagSnapshot(
  adapter: BrowserAdapter,
  id: string,
  tags: string[],
  now?: Date,
): Promise<SnapshotMeta | null> {
  return await editMeta(adapter, id, (meta) => ({
    ...meta,
    tags: tags.map((tag) => tag.trim()).filter((tag) => tag !== ""),
    updatedAt: isoOf(now ?? new Date()),
  }));
}

/** Removes the body as well as the index entry. An index only delete is a leak. */
export async function deleteSnapshot(adapter: BrowserAdapter, id: string): Promise<void> {
  await writeIndex(adapter, (list) => list.filter((entry) => entry.id !== id));
  await adapter.storageRemove([BODY_PREFIX + id]);
}

/**
 * Bodies with no index entry, left by a write that was interrupted. Reported
 * rather than removed quietly, because a body without an entry is still a
 * session somebody saved.
 */
export async function findOrphans(adapter: BrowserAdapter): Promise<string[]> {
  const all = await adapter.storageGetAll();
  const known = new Set((await listSnapshots(adapter)).map((meta) => meta.id));
  return Object.keys(all)
    .filter((key) => key.startsWith(BODY_PREFIX))
    .map((key) => key.slice(BODY_PREFIX.length))
    .filter((id) => !known.has(id));
}

export async function usage(adapter: BrowserAdapter): Promise<Usage> {
  const measured = await adapter.storageBytesInUse();
  const bytes =
    measured ?? (await listSnapshots(adapter)).reduce((sum, meta) => sum + meta.bytes, 0);
  const fraction = bytes / SOFT_CAP_BYTES;
  return {
    bytes,
    cap: SOFT_CAP_BYTES,
    fraction,
    warn: fraction >= WARN_AT,
    measured: measured !== null,
  };
}

async function editMeta(
  adapter: BrowserAdapter,
  id: string,
  edit: (meta: SnapshotMeta) => SnapshotMeta,
): Promise<SnapshotMeta | null> {
  let updated: SnapshotMeta | null = null;
  await writeIndex(adapter, (list) =>
    list.map((entry) => {
      if (entry.id !== id) return entry;
      updated = edit(entry);
      return updated;
    }),
  );
  return updated;
}

/**
 * Read, change, write, then read back to confirm. Two manager pages open at once
 * is a real situation, and `storage.local` has no transaction: the confirm and
 * retry is what keeps one page's save from being erased by the other's.
 */
async function writeIndex(
  adapter: BrowserAdapter,
  change: (list: SnapshotMeta[]) => SnapshotMeta[],
): Promise<SnapshotMeta[]> {
  let attempt = 0;
  let wanted: SnapshotMeta[] = [];
  while (attempt < 3) {
    const current = await listSnapshots(adapter);
    wanted = change(current);
    await adapter.storageSet({ [INDEX_KEY]: wanted });
    const after = await listSnapshots(adapter);
    if (sameIds(after, wanted)) return after;
    attempt += 1;
  }
  return wanted;
}

function sameIds(a: SnapshotMeta[], b: SnapshotMeta[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map((entry) => entry.id).sort();
  const right = b.map((entry) => entry.id).sort();
  return left.every((id, index) => id === right[index]);
}

function isMeta(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const meta = value as Record<string, unknown>;
  return typeof meta["id"] === "string" && typeof meta["name"] === "string";
}

function isoOf(when: Date): string {
  const offset = -when.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const pad = (value: number): string => String(Math.floor(Math.abs(value))).padStart(2, "0");
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(Math.abs(offset) % 60)}`
  );
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function newId(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
