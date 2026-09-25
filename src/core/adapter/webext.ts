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
  };
  permissions: {
    contains(permissions: { permissions: string[] }): Promise<boolean>;
    request(permissions: { permissions: string[] }): Promise<boolean>;
  };
  downloads?: {
    download(options: Record<string, unknown>): Promise<number>;
  };
  action?: {
    setBadgeText(details: { text: string }): Promise<void>;
    setBadgeBackgroundColor(details: { color: string }): Promise<void>;
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
