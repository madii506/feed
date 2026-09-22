# FEED

A launchpad where every coin is linked to one feed. The creator's share accrues from the first trade, and the page says unclaimed until they take it.

- `index.html` — the site
- `docs.html` — the mechanism, the wire format, and what is not verifiable today
- `api/feed.js` — resolves a profile URL to platform, handle, account ID, followers, avatar
- `api/avatar.js` — resolves the same input and streams the picture
- `api/logo.js` — a platform's own mark, fetched from its own domain
- `api/price.js` — SOL spot, with its source and the second it was read
- `test.mjs` — 42 checks at 1400 and 390

No token exists yet. When one does, the address appears on the site and in the pinned post at the same moment.
