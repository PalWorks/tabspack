/**
 * A browser environment that cannot start a mail client, or any other desktop
 * application, on the maintainer's machine.
 *
 * Why this exists. The support fallback test ends, by design, with the extension
 * handing a `mailto:` address to the operating system, and on a real desktop that
 * opened the maintainer's Thunderbird on every smoke run, several times an hour,
 * even after they closed it.
 *
 * The first fix was a Chromium preference, `protocol_handler.excluded_schemes`,
 * written into the test profile. **It was measured on 2026-09-26 not to work**:
 * the extension opens the address with `tabs.create`, and an extension created
 * navigation goes to the external handler without consulting that list. A
 * process watcher caught Thunderbird starting with the test's own message body in
 * its arguments, with the preference in place.
 *
 * So the handoff is stopped where it actually leaves the browser, on both of the
 * routes it can take. Measured, the route on this machine is the session bus:
 * Chromium asks the XDG desktop portal to open the address, and the portal starts
 * the mail client. The other route, on a desktop without a portal, is `xdg-open`
 * found on `PATH`. The browser is given a bus address that leads nowhere, and a
 * `PATH` whose front directory holds
 * stand-ins for `xdg-open`,
 * `xdg-email`, `gio`, `kde-open` and `gnome-open` which record the address to a
 * file and start nothing. The browser sees a successful handoff, exactly as it
 * would on a desktop with a mail client, and the test can now assert what was
 * handed off rather than only that something happened.
 */
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const STANDINS = ["xdg-open", "xdg-email", "gio", "kde-open", "kde-open5", "gnome-open", "sensible-browser"];

/**
 * Returns an `env` to hand to a browser launch, and a function that reads back
 * every address the browser tried to give to the desktop.
 */
export async function quietDesktop() {
  const dir = await mkdtemp(path.join(tmpdir(), "tabspack-no-desktop-"));
  const bin = path.join(dir, "bin");
  const log = path.join(dir, "handed-off.log");
  await mkdir(bin, { recursive: true });
  await writeFile(log, "", "utf8");

  const script = `#!/bin/sh\n# Stand-in written by scripts/lib/no-mail-client.mjs. Records, starts nothing.\nprintf '%s\\n' "$*" >> '${log}'\nexit 0\n`;
  for (const name of STANDINS) {
    const file = path.join(bin, name);
    await writeFile(file, script, "utf8");
    await chmod(file, 0o755);
  }

  return {
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      /*
       * The route that actually reached Thunderbird. On a desktop with an XDG
       * portal, Chromium asks the session bus to open the address, and the bus
       * launches the mail client under systemd, which is why the process watcher
       * saw it parented to `systemd --user` rather than to the browser. A bus
       * address that leads nowhere closes that route for this browser only, and
       * leaves the user's own session untouched. Chromium then falls back to
       * `xdg-open` on PATH, which is a stand-in.
       */
      DBUS_SESSION_BUS_ADDRESS: "disabled:",
    },
    /** Every argument line a stand-in received, oldest first. */
    async handedOff() {
      return (await readFile(log, "utf8")).split("\n").filter(Boolean);
    },
  };
}
