// Proxies a nonprofit's own logo so the register identifies each organisation
// the way any donation directory does. Tries the well-known icon paths, the
// public logo services, and finally the organisation's own homepage markup —
// keeping the largest image found. 404 when there is nothing usable, and the
// page then shows the lettermark it already draws underneath.

const DIRECT = (d) => [
  `https://${d}/apple-touch-icon.png`,
  `https://${d}/apple-touch-icon-precomposed.png`,
  `https://logo.clearbit.com/${d}?size=256`,
  `https://www.google.com/s2/favicons?domain=${d}&sz=256`,
  `https://icons.duckduckgo.com/ip3/${d}.ico`,
];

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; FEED/1.0)' };

function widthOf(buf, type) {
  try {
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return buf.readUInt32BE(16); // PNG
    if (buf.length > 6 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1)                      // ICO
      return buf[6] === 0 ? 256 : buf[6];
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {                              // JPEG
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
          return buf.readUInt16BE(i + 7);
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (/svg/.test(type)) return 512;
  } catch (e) {}
  return 64;
}

async function grab(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 4000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: UA });
    clearTimeout(t);
    return r;
  } catch (e) { clearTimeout(t); return null; }
}

async function tryImage(url, best) {
  const r = await grab(url);
  if (!r || !r.ok) return best;
  const type = r.headers.get('content-type') || '';
  if (!/^image\//.test(type)) return best;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 220) return best;
  const w = widthOf(buf, type);
  if (!best || w > best.w) return { buf, type, w, host: url.split('/')[2] };
  return best;
}

// Read the organisation's homepage and pull out whatever icons it declares.
async function fromMarkup(d) {
  const out = [];
  for (const base of [`https://${d}/`, `https://www.${d}/`]) {
    const r = await grab(base, 5000);
    if (!r || !r.ok) continue;
    const html = (await r.text()).slice(0, 200000);
    const origin = new URL(r.url);
    const push = (h) => { try { out.push(new URL(h, origin).href); } catch (e) {} };

    const linkRe = /<link[^>]+>/gi;
    let m;
    while ((m = linkRe.exec(html))) {
      const tag = m[0];
      if (!/rel=["'][^"']*(apple-touch-icon|icon|mask-icon)/i.test(tag)) continue;
      const href = tag.match(/href=["']([^"']+)["']/i);
      if (href) push(href[1]);
    }
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (og) push(og[1]);
    if (out.length) break;
  }
  return out.slice(0, 6);
}

module.exports = async (req, res) => {
  const d = String((req.query && req.query.d) || '')
    .toLowerCase().replace(/[^a-z0-9.-]/g, '');

  if (!d || d.indexOf('.') < 0 || d.length > 80) {
    res.status(400).json({ error: 'bad domain' });
    return;
  }

  let best = null;
  for (const url of DIRECT(d)) {
    best = await tryImage(url, best);
    if (best && best.w >= 180) break;
  }

  // Everything so far was tiny — ask the site itself what its icon is.
  if (!best || best.w < 96) {
    for (const url of await fromMarkup(d)) {
      best = await tryImage(url, best);
      if (best && best.w >= 180) break;
    }
  }

  if (!best) {
    res.setHeader('cache-control', 'public, s-maxage=3600');
    res.status(404).json({ error: 'no logo for ' + d });
    return;
  }

  res.setHeader('content-type', best.type);
  res.setHeader('cache-control', 'public, s-maxage=604800, stale-while-revalidate=86400');
  res.setHeader('x-logo-source', best.host);
  res.setHeader('x-logo-width', String(best.w));
  res.status(200).send(best.buf);
};
