# Reference, not shippable

`TabsPack Icon v2.png` is the concept the maintainer drew: several browser
windows stacked, with a restore arrow in front. The idea is good, and it is
what `TabsPack Icon v3.png` became.

The image itself cannot ship, for two reasons.

**It carries other companies' trademarks.** The four windows are badged with
the Chrome, Firefox, Edge and Opera logos. Those are registered marks of
Google, Mozilla, Microsoft and Opera Software. Every store's brand policy
prohibits using their own or a third party's marks in an extension's icon,
because it implies an endorsement that does not exist. On the Chrome Web Store
this is the kind of thing that is rejected at review, and if it slips through
it is the kind of thing that is taken down later, which is worse.

**It does not survive 16 pixels.** Four overlapping windows, four logos and an
arrow resolve into a blue smear in a toolbar. `.tmp/icons/v2-at-size.png`,
written by the snippet in the commit that added this note, shows it at the
sizes a browser actually draws.

**`TabsPack Icon v3.png` is the one that shipped.** Same idea, no third party
marks, and a density that holds together small. It is the source of
`assets/icon.png`, cropped to its opaque bounding box and masked to a rounded
square by the note in ADR-041, and `scripts/gen-assets.mjs` renders that down
into every size a manifest asks for with a sharpening pass that is hardest at
16 px.

Two vector redraws of v3 were made and both were worse than the artwork they
copied: thinner, emptier, the fan too small. They were deleted rather than kept
as a tempting alternative, and the reasoning is in ADR-041. `npm run icons:compare`
now renders the shipped mark beside any new candidate, which makes it a tool for
judging a replacement rather than for making the first choice.
