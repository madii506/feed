// One real number on the page: the SOL spot price, read live, with its source
// and the second it was read. Used only to put a familiar unit beside a figure
// the visitor typed themselves. If it cannot be read, the page shows the SOL
// figure alone rather than a stale or invented dollar amount.

async function grab(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 5000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'FEED/1.0' } });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { clearTimeout(t); return null; }
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=300');

  const cb = await grab('https://api.coinbase.com/v2/prices/SOL-USD/spot');
  if (cb && cb.data && cb.data.amount) {
    res.status(200).json({
      ok: true, symbol: 'SOL', usd: Number(cb.data.amount),
      source: 'api.coinbase.com', at: new Date().toISOString(),
    });
    return;
  }
  const kr = await grab('https://api.kraken.com/0/public/Ticker?pair=SOLUSD');
  const k = kr && kr.result && Object.values(kr.result)[0];
  if (k && k.c && k.c[0]) {
    res.status(200).json({
      ok: true, symbol: 'SOL', usd: Number(k.c[0]),
      source: 'api.kraken.com', at: new Date().toISOString(),
    });
    return;
  }
  res.status(200).json({ ok: false, error: 'no price source answered' });
};
