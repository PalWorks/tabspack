/**
 * The one place the `browser` global enters the codebase.
 *
 * `webextension-polyfill` gives Chromium the promise based `browser.*` API that
 * Gecko has natively. Its own typings are not depended on: the surface TabsPack
 * uses is declared here, narrowly, so a typo in an API name is a compile error.
 */
import polyfill from "webextension-polyfill";

interface Listener<A extends unknown[]> {
  addListener(callback: (...args: A) => unknown): void;
}

export interface WebExtApi {
  runtime: {
    id?: string;
    getManifest(): { version: string; name: string };
    getURL(path: string): string;
    getPlatformInfo?(): Promise<{ os: string; arch: string }>;
    getBrowserInfo?(): Promise<{ name: string; version: string }>;
    onInstalled: Listener<[{ reason?: string }]>;
    onStartup?: Listener<[]>;
    openOptionsPage?(): Promise<void>;
    lastError?: { message?: string };
  };
  runtime2?: never;
  tabs: {
    query(query: Record<string, unknown>): Promise<unknown[]>;
    get(tabId: number): Promise<unknown>;
    create(props: Record<string, unknown>): Promise<unknown>;
    update(tabId: number, props: Record<string, unknown>): Promise<unknown>;
    remove(tabIds: number | number[]): Promise<void>;
    discard?(tabIds: number | number[]): Promise<unknown>;
    group?(options: Record<string, unknown>): Promise<number>;
    onCreated?: Listener<[unknown]>;
    onRemoved?: Listener<[number, { isWindowClosing?: boolean; windowId?: number }]>;
    onUpdated?: Listener<[number, Record<string, unknown>, unknown]>;
    onMoved?: Listener<[number, unknown]>;
    onAttached?: Listener<[number, unknown]>;
    onDetached?: Listener<[number, unknown]>;
  };
  alarms?: {
    get(name: string): Promise<{ name: string; scheduledTime: number; periodInMinutes?: number } | undefined>;
    create(name: string, info: { delayInMinutes?: number; periodInMinutes?: number }): Promise<void> | void;
    clear(name: string): Promise<boolean>;
    onAlarm: Listener<[{ name: string }]>;
  };
  sessions?: {
    getRecentlyClosed(filter?: { maxResults?: number }): Promise<unknown[]>;
    restore(sessionId?: string): Promise<unknown>;
  };
  windows: {
    getAll(props: Record<string, unknown>): Promise<unknown[]>;
    getCurrent(props: Record<string, unknown>): Promise<unknown>;
    create(props: Record<string, unknown>): Promise<unknown>;
    update(windowId: number, props: Record<string, unknown>): Promise<unknown>;
  };
  tabGroups?: {
    query(query: Record<string, unknown>): Promise<unknown[]>;
    update(groupId: number, props: Record<string, unknown>): Promise<unknown>;
  };
  storage: {
    onChanged?: Listener<[Record<string, unknown>, string]>;
    local: {
      get(keys: unknown): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      getBytesInUse?(keys: string | string[] | null): Promise<number>;
    };
    /** In memory, and emptied when the browser restarts: how a worker tells a new browser session from a wake. */
    session?: {
      get(keys: unknown): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
  };
  permissions: {
    contains(permissions: { permissions?: string[]; origins?: string[] }): Promise<boolean>;
    request(permissions: { permissions?: string[]; origins?: string[]; data_collection?: string[] }): Promise<boolean>;
  };
  downloads?: {
    download(options: Record<string, unknown>): Promise<number>;
  };
  action?: {
    setBadgeText(details: { text: string }): Promise<void>;
    setBadgeBackgroundColor(details: { color: string }): Promise<void>;
    /** Chromium 110 and Gecko 120 onward. Absent is not a failure. */
    setBadgeTextColor?(details: { color: string }): Promise<void>;
    setTitle?(details: { title: string }): Promise<void>;
  };
  commands?: {
    getAll(): Promise<unknown[]>;
    onCommand?: Listener<[string]>;
  };
  i18n?: {
    getMessage(key: string, subs?: string[]): string;
  };
  extension?: {
    isAllowedIncognitoAccess?(): Promise<boolean>;
    isAllowedFileSchemeAccess?(): Promise<boolean>;
  };
  contextualIdentities?: unknown;
}

/**
 * The polyfill ships CommonJS with loose typings, so it is cast once to the
 * narrow surface above rather than typed `any` at every call site.
 */
export const browser = polyfill as unknown as WebExtApi;
