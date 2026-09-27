# tabspack

Read, validate and write **TabsPack files**: every open browser tab in one
small JSON file, with its windows, order, pinned tabs and tab groups.

This is the reader and writer from the [TabsPack browser
extension](https://palworks.github.io/tabspack/). The package is compiled
from the extension's own source files, so a file the extension accepts is a
file this package accepts. There is no second parser to fall out of step.

- No runtime dependencies.
- Runs in Node 18 or later and in any browser bundler.
- Ships with its TypeScript types and the JSON Schema.

```sh
npm install tabspack
```

## Read a file

```js
import { readFileSync } from "node:fs";
import { read } from "tabspack";

const result = read(readFileSync("tabs.tabspack.json", "utf8"));
if (result.ok) {
  for (const win of result.session.windows) {
    console.log(win.tabs.length, "tabs");
  }
} else {
  for (const issue of result.issues) console.error(issue.message, issue.fix);
}
```

`read` never throws. Every problem comes back as an `Issue` with a `code`, a
JSON `path`, a `message` a person can read, and usually a `fix`.

**What `read` accepts:**

- TabsPack files of any supported `schemaVersion`. Older versions are upgraded.
- Exports from other popular tab managers.
- Browser bookmark files.
- CSV files.
- Lists of links, as plain text or Markdown.

`result.source` says what the input turned out to be, and what that format
could not carry. Addresses parked by a tab suspender are recovered to the real
page. Pass `{ recoverSuspended: false }` to keep them as they are.

## Write a file

```js
import { write } from "tabspack";

const text = write(session, { name: "Research" });
```

The output is exactly what the extension writes: two-space indentation, a
trailing newline, and the current `schemaVersion`.

## Validate a file

```js
import { validate } from "tabspack";

const { ok, issues } = validate(text); // a string or an already parsed value
```

`validate` checks a TabsPack document against the specification, upgrading an
older version first. It is strict about TabsPack documents only. To read other
formats, use `read`.

## The schema

```js
import { createRequire } from "node:module";

const schema = createRequire(import.meta.url)("tabspack/schema.json");
```

The same schema is published at
<https://palworks.github.io/tabspack/schema/tabspack.v1.schema.json>. The
format itself is specified in
[docs/SPEC.md](https://github.com/PalWorks/tabspack/blob/main/docs/SPEC.md).

## Versions

The package's major version is the file format's `schemaVersion`. Version 1
of this package reads and writes `schemaVersion` 1 and anything older that
can be upgraded.

## Licence

MIT, palworks.ai.
