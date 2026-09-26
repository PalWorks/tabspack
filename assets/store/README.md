# Store artwork

Everything a store dashboard takes, at the exact size it asks for. Never edited
by hand, and written by two scripts, so neither of them owns this README.

| File | Size | Made by | For |
|---|---|---|---|
| `store-icon-128.png` | 128 by 128, transparent | `npm run store-art` | The Chrome Web Store icon: the mark at 96 px inside 16 px of padding, as Google recommends |
| `screenshot-1` to `screenshot-5` | 1280 by 800, no alpha | `npm run store-art` | The five Chrome Web Store screenshots, in carousel order |
| `promo-small-440x280.png` | 440 by 280 | `npm run store-art` | The small promo tile, Chrome and Edge |
| `promo-marquee-1400x560.png` | 1400 by 560 | `npm run store-art` | The marquee, Chrome only |
| `logo-300x300.png` | 300 by 300 | `npm run assets` | Edge's store logo |

`npm run store-art` runs the built extension in a real Chromium, photographs its
real pages with the demo session in `assets/promo/demo-session.mjs`, and lays the
captures into the designs in `assets/promo/art.html`. The captures are committed
in `assets/promo/captures/`, so `npm run store-art:compose` can change a headline
without a browser session.

No capture run reaches the internet: every hostname fails to resolve inside the
browser, and the run fails if any tab ends up anywhere other than the address it
was sent to. One thing in the screenshots is staged, and it is said here rather
than hidden: the time each tab was last opened, because a browser sets that
itself and no API can.
