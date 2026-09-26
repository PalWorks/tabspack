# Reference, not shippable

`TabsPack Icon v2.png` is the concept the maintainer drew: several browser
windows stacked, with a restore arrow in front. The idea is good and it is
where candidates 6 and 7 come from.

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

It is also a raster at 500 and 1254 pixels rather than a vector, and the
pipeline renders `assets/icon.png` down into every size a manifest asks for.

`6-stack-arrow.svg` and `7-stack-simple.svg` are the same idea drawn as vectors,
with no third party marks, at a density that holds together small.
