// Proxies a profile picture so the page never stores one and never hotlinks a
// platform's CDN from the browser. Takes the same input as /api/feed — a
// profile URL or @handle — resolves it through that reader, then streams the
// bytes. 404 when nothing resolves, and the page hides the box.

const feed = require('./feed.js');

function collect(fn, query) {
  return new Promise((resolve) => {
    const res = {
      _s: 200, _h: {},
      setHeader(k, v) { this._h[k] = v; },
      status(c) { this._s = c; return this; },
      json(o) { resolve({ status: this._s, body: o }); return this; },
      send(o) { resolve({ status: this._s, body: o }); return this; },
    };
    fn({ query }, res).catch(() => resolve({ status: 500, body: null }));
  });
}

module.exports = async (req, res) => {
  const u = (req.query && (req.query.u || req.query.h)) || '';
  const r = await collect(feed, { u });
  const src = r && r.body && r.body.avatar;
  if (!src) {
    res.setHeader('cache-control', 'public, s-maxage=600');
    res.status(404).json({ error: 'no avatar' });
    return;
  }
  let up = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    up = await fetch(src, {
      signal: ctl.signal, redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; FEED/1.0)', referer: '' },
    });
    clearTimeout(t);
  } catch (e) { up = null; }
  if (!up || !up.ok) {
    res.setHeader('cache-control', 'public, s-maxage=600');
    res.status(404).json({ error: 'upstream refused' });
    return;
  }
  const buf = Buffer.from(await up.arrayBuffer());
  res.setHeader('content-type', up.headers.get('content-type') || 'image/jpeg');
  res.setHeader('cache-control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.status(200).send(buf);
};
