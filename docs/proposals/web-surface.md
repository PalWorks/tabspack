# Proposal: B-401 and B-503 on the website

**Status: proposed, not agreed.** Nothing here is built. This exists so the two
rows can be argued about with something concrete in front of them.

| | |
|---|---|
| Covers | B-401 pack rendered as a readable page, B-503 specification site and adoption |
| Raised | 2026-09-26, by the maintainer asking whether both could live on the website |
| Depends on | Nothing. Both are additive to a site that already exists |
| Blocks | Nothing. Both are post v1 and neither should delay T-509 |

---

## 1. The thing they have in common

Both rows look like website work and are really the same piece of engineering:
**`src/core/` already runs anywhere.**

`deserialize.ts`, `schema.ts`, `exporters.ts` and all seven import adapters
import nothing but each other and `src/types/`. No `browser.*`, no DOM, no
adapter. That is not luck, it is the boundary rule the linter has been
enforcing since M0, and it means the parser can be bundled for a web page with
esbuild and no changes at all.

That single fact is what makes both of these cheap, and it is also the
constraint that keeps them honest:

> **One parser, two surfaces.** The website must never get a second
> implementation of the format. If the site disagrees with the extension about
> what a file contains, the format is worth nothing, and two parsers disagree
> eventually no matter how careful anyone is.

So the proposal for both is the same shape: bundle the real core, use it, and
add a check that the bundle is current.

### Table P1: What would be bundled

| Module | Size, rough | Used by |
|---|---|---|
| `core/schema.ts`, `core/deserialize.ts`, `core/issues.ts` | small | both |
| `core/adapters/*` (7 formats plus detection) | medium | the viewer |
| `core/exporters.ts` | small | the viewer |
| `core/unsuspend.ts` | small | the viewer |
| `ui/manager/preview-tree.ts` | medium | the viewer, for the tree |

Estimated bundle, minified: **40 to 70 KB**, on one page. Every other page on
the site keeps its current 1.2 KB of JavaScript.

---

## 2. B-401, as two separate things

The row says "render a pack as a self contained readable HTML page". On the
website that splits into two pieces that can ship independently, and only the
second needs a store review.

### B-401a: `/viewer/` on the site

**Drop a pack, see what is in it.** No extension, no install, no account.

Someone is emailed a `.tabspack.json`. Today they can open it in a text editor
and read raw JSON, which is exactly the "sending a colleague a JSON file is
homework" problem the row describes. A viewer turns that into a page: windows,
groups, titles, favicons off, every address a real link.

What it would do:

| | |
|---|---|
| Read | Any of the eight formats the extension reads, detected by content, using `core/adapters/detect.ts` unchanged |
| Show | The same tree the import preview shows, from `preview-tree.ts`, with the same counts and the same issue list |
| Recover | Suspended tab wrappers unwrapped, using `core/unsuspend.ts`, with the count reported as the extension reports it |
| Convert | Download the same pack as a URL list, flat JSON or CSV, using `core/exporters.ts` |
| Offer | One quiet line: to put these back as real tabs, here is the extension |

**It must upload nothing, and that has to be true rather than claimed.**
`FileReader` only. No request of any kind. The page says so at the top, the
privacy policy and the cookie notice both gain a sentence, and
`check-site-browser.mjs` gains an assertion that loading a file produces zero
network requests. That last one is the only version of this promise worth
making: a test, not a sentence.

**Why this is the strongest single thing on this list.** It is the only piece
of work in the backlog that gives a person who has never heard of TabsPack a
reason to arrive at the site. They were sent a file. They need to read it. The
tool that reads it mentions the extension once. That is a better acquisition
path than any amount of listing copy, and it costs no store review to ship.

There is a second effect, and it is worth being honest that it is the larger
one commercially: **it is a free online converter**. "OneTab export to CSV",
"Session Buddy JSON to a list of URLs", "read a .tabspack.json file". Those are
things people search for, the site would answer them with a working tool rather
than a paragraph, and every one of those conversions is already written and
already tested. The SEO value of that is larger than the spec page in section 3
by a wide margin.

### B-401b: an HTML export format, in the extension

A new entry in the export format dropdown: **Readable page (.html)**. One
self contained file, no network, with the pack embedded in a
`<script type="application/json">` block and the readable tree rendered around
it. It opens for anyone in any browser, and TabsPack re-imports it by reading
the embedded block back out.

This is the literal reading of the row and it is the weaker half. It duplicates
the viewer's rendering into the extension bundle, and it produces a file
perhaps 30 KB larger than the JSON it wraps. It is worth doing **after** the
viewer exists, reusing the same renderer, and it needs a store update while the
viewer does not.

There is also a sharper alternative worth considering instead: keep exporting
JSON, and have the extension offer **"open this pack in the viewer"**, which is
a link to the site. Zero new format, zero size, one extra line of code. The
cost is that it only works with a network, whereas the HTML file works forever
on a disconnected machine. That trade is the actual decision in B-401b, and it
should be made when the viewer exists rather than now.

---

## 3. B-503, the specification

The row says "a format is a standard only when a second implementation exists",
and that is the right test. Measured against it, **a specification page does
not by itself move anything**, and the honest expected value here is lower than
section 2. What it does buy is real but narrower:

1. A stable, citable address for the format, which the store listing, the
   README and `llms.txt` can all point at.
2. A **resolvable JSON Schema URL**, which is the thing a second implementer
   actually needs and which does not exist today. See section 4.
3. A conformance suite anyone can run against their own reader.
4. Search presence for "browser tab export format" and neighbours, which is a
   narrow but genuinely uncontested phrase.

### What it would be

| Page | Contents |
|---|---|
| `/spec/` | `docs/SPEC.md` rendered, with a table of contents and anchors |
| `/spec/v1/tabspack.schema.json` | The schema, served at a stable path with the right content type |
| `/spec/examples/` | Every file in `test/fixtures/valid/`, downloadable, each with a line saying what it demonstrates |
| `/spec/conformance/` | `test/fixtures/invalid/` and `expectations.json`, so a second implementer can check their reader rejects what ours rejects and accepts what ours accepts |
| `/spec/#reading` | A reader in about twenty lines, in JavaScript and in Python. The single highest leverage thing on the page |

### The part that has to be got right

**`docs/SPEC.md` stays the source.** The page is generated from it by the
existing site generator, and `npm run site:check` fails if the published page
is stale. A specification that exists twice is a specification that is wrong in
one of the two places within a month.

That needs a Markdown to HTML step the generator does not have. `SPEC.md` uses
a small subset: headings, tables, fenced code, lists, links, bold and inline
code. A purpose built converter for exactly that subset is roughly 120 lines,
matches how everything else in `scripts/` is built, and can be paired with a
lint rule that fails if `SPEC.md` ever uses a construct the converter does not
handle. The alternative is a Markdown dependency, which is one dependency for
one page and, more to the point, would silently render something subtly wrong
rather than failing.

### The outreach half

Writing to the maintainers of OneTab, Session Buddy and Tab Session Manager
offering to write the adapter for them is the part of B-503 that could actually
produce a second implementation. It is not engineering, it costs an afternoon,
and **it should wait until the extension is published**, because the first
question any of them will ask is where it is.

---

## 4. A defect found while exploring this

`schema/tabspack.v1.schema.json` declares:

```json
"$id": "https://tabspack.dev/schema/tabspack.v1.schema.json"
```

**`tabspack.dev` is not registered.** It has no DNS record and no whois entry.
The format's canonical identity currently points at a domain that anybody could
buy, and the Firefox extension id, `tabspack@tabspack.dev`, leans on the same
name.

A `$id` is an identifier and is not required to resolve, so nothing is broken
today. It is still the wrong state to publish a format in, for two reasons: a
second implementer who follows the `$id` finds nothing, and a third party who
registers the domain can put anything they like at the canonical address of our
schema.

### Table P2: The three ways out

| | Cost | Trade |
|---|---|---|
| **Point `$id` at the site**, `https://palworks.github.io/tabspack/spec/v1/tabspack.schema.json` | Nothing | Works today and resolves. Ties the format's identity to a repository path, so moving the site later breaks the address a second implementer wrote down |
| **Register `tabspack.dev`** and point it at the site | About a pound a month | The coherent answer: the extension id already claims this name, the address is short and quotable, and it survives the site moving. Needs a domain and a DNS record |
| **Leave it** | Nothing | Not recommended. It is the only option where somebody else can end up owning the canonical URL of our format |

This should be settled before the first store submission, because the schema
ships inside the package and a `$id` that changes after publication is a format
version question rather than an edit.

---

## 5. Sequencing, effort and what I would actually do

### Table P3: The proposal, in order

| # | Piece | Effort | Impact | Needs a store review | Note |
|---|---|---|---|---|---|
| 0 | Settle the `$id` (section 4) | S | High | No | Do this before T-509, not after |
| 1 | `/viewer/` on the site | M | High | **No** | The acquisition asset, and a free converter. Reuses tested code |
| 2 | `/spec/` with the hosted schema, examples and conformance | M | Medium | No | Cheap once the site has the generator step from 1 |
| 3 | Outreach to three maintainers | S | Medium | No | After publication, not before |
| 4 | HTML export in the extension, or a link to the viewer | M | Low | Yes | Decide which once 1 exists |

### What I would not do

**Not before T-509.** None of this is on the critical path to a published
extension, and all of it is more attractive than the store submission, which is
exactly why it should wait. The store queues are the long pole and nothing here
shortens them.

**Not the HTML export first.** It is the literal reading of B-401 and the
weaker half of it: it duplicates a renderer, grows the package, and needs a
review, to produce a file the viewer produces for free from the JSON we already
write.

**Not a second parser, ever.** If `/viewer/` cannot be built out of `src/core/`
unchanged, the right answer is to fix `src/core/` so it can be, not to write a
second reader for the web.

### Table P4: What it would change outside the code

| File | Change |
|---|---|
| `PRIVACY.md`, `/privacy/`, `/cookies/` | The viewer reads a file in the browser and uploads nothing. Stated, and asserted by a test |
| `scripts/check-site-browser.mjs` | A viewer page that loads a file must produce zero network requests |
| `scripts/gen-site.mjs` | A Markdown subset renderer for `/spec/`, and an esbuild step for the viewer bundle, both covered by `--check` |
| `README.md`, `llms.txt`, `store_listing.md` | The spec's canonical URL, once it exists |
| `docs/ROADMAP.md` | B-401 splits into two rows, B-503 into the page and the outreach |

---

## 6. The decision being asked for

1. **The `$id`**: site path, or register `tabspack.dev`?
2. **Order**: is the viewer first, ahead of the spec page, agreed?
3. **Timing**: after T-509, or is one of these worth doing while the store
   queues run?
