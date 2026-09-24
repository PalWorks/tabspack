/**
 * The polyfill ships without typings. It is declared as `unknown` here and
 * narrowed once, in `src/core/adapter/webext.ts`, to the small API surface
 * TabsPack actually uses. Declaring it `any` would silently disable type
 * checking across every browser call.
 */
declare module "webextension-polyfill" {
  const browser: unknown;
  export default browser;
}
