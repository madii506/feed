// Resolves a pasted profile URL into the fields a coin page needs: the
// platform, the handle, the display name, the platform's own account ID, a
// follower count where the platform publishes one, and an avatar.
//
// The account ID is the point of this endpoint. A claim is matched against the
// ID, not the @handle, because handles are sold, renamed and squatted and the
// ID is not. Where a platform will not hand over an ID to a server, we say so
// in `note` and the page says so too — we never fabricate one, and a coin whose
// feed has no stable ID is launched with that written on its page.
//
// Nothing here invents a name, a count or an avatar. A field we could not read
// comes back null.

const UA = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
};

async function grab(url, ms, extra) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 6000);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: Object.assign({}, UA, extra || {}),
    });
    clearTimeout(t);
    return r;
  } catch (e) {
    clearTimeout(t);
    return null;
  }
}

async function text(url, ms, extra) {
  const r = await grab(url, ms, extra);
  if (!r || !r.ok) return null;
  return await r.text();
}

async function json(url, ms, extra) {
  const r = await grab(url, ms, extra);
  if (!r || !r.ok) return null;
  try { return await r.json(); } catch (e) { return null; }
}

const meta = (html, prop) => {
  if (!html) return null;
  const re = new RegExp(
    '<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*content=["\']([^"\']+)',
    'i');
  const m = html.match(re) || html.match(new RegExp(
    '<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']' + prop + '["\']',
    'i'));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null;
};

// "1.23M subscribers" / "8,412 followers" -> 1230000 / 8412
function count(s) {
  if (!s) return null;
  const m = String(s).replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  return Math.round(n * mult);
}

function parse(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    if (/^@/.test(s)) return { platform: 'x', handle: s.slice(1) };   // a bare @ is X
    if (!/\./.test(s)) return { platform: 'x', handle: s };
    s = 'https://' + s;
  }
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);
  const h = (v) => (v || '').replace(/^@/, '');

  if (/(^|\.)(x|twitter)\.com$/.test(host)) return { platform: 'x', handle: h(seg[0]) };
  if (/(^|\.)youtube\.com$/.test(host)) {
    if (seg[0] && seg[0][0] === '@') return { platform: 'youtube', handle: h(seg[0]), path: '/' + seg[0] };
    if (seg[0] === 'channel' && seg[1]) return { platform: 'youtube', handle: seg[1], path: '/channel/' + seg[1] };
    if ((seg[0] === 'c' || seg[0] === 'user') && seg[1]) return { platform: 'youtube', handle: seg[1], path: '/' + seg[0] + '/' + seg[1] };
    return { platform: 'youtube', handle: h(seg[0]), path: '/' + (seg[0] || '') };
  }
  if (/(^|\.)youtu\.be$/.test(host)) return { platform: 'youtube', handle: h(seg[0]), path: '/' + (seg[0] || '') };
  if (/(^|\.)tiktok\.com$/.test(host)) return { platform: 'tiktok', handle: h(seg[0]) };
  if (/(^|\.)instagram\.com$/.test(host)) return { platform: 'instagram', handle: h(seg[0]) };
  if (/(^|\.)twitch\.tv$/.test(host)) return { platform: 'twitch', handle: h(seg[0]) };
  if (/(^|\.)kick\.com$/.test(host)) return { platform: 'kick', handle: h(seg[0]) };
  return { platform: 'other', handle: h(seg[0]) || host, host };
}

const LABEL = {
  x: 'X', youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram',
  twitch: 'Twitch', kick: 'Kick', other: 'Web',
};

async function readX(handle) {
  // Three routes, because no single one has stayed up. fxtwitter and vxtwitter are
  // the community mirrors; the syndication widget is X's own and the oldest. If all
  // three refuse we say X refused rather than inventing a profile.
  let j = await json('https://api.fxtwitter.com/' + encodeURIComponent(handle), 6000);
  let u = j && (j.user || (j.result && j.result.user));
  if (!u) {
    const v = await json('https://api.vxtwitter.com/' + encodeURIComponent(handle), 6000);
    const vu = v && (v.user || v);
    if (vu && (vu.screen_name || vu.user_screen_name)) {
      u = {
        name: vu.name || vu.user_name || null,
        id: vu.id || vu.id_str || vu.user_id || null,
        followers: typeof vu.followers === 'number' ? vu.followers
                 : (typeof vu.followers_count === 'number' ? vu.followers_count : null),
        avatar_url: vu.avatar_url || vu.profile_image_url_https || null,
        screen_name: vu.screen_name || vu.user_screen_name,
      };
    }
  }
  if (u) {
    return {
      name: u.name || null,
      id: u.id ? String(u.id) : null,
      followers: typeof u.followers === 'number' ? u.followers
               : (typeof u.followers_count === 'number' ? u.followers_count : null),
      avatar: u.avatar_url || null,
      url: 'https://x.com/' + (u.screen_name || handle),
      note: null,
    };
  }
  const s = await json(
    'https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=' +
    encodeURIComponent(handle), 6000);
  if (Array.isArray(s) && s[0]) {
    return {
      name: s[0].name || null,
      id: s[0].id ? String(s[0].id) : null,
      followers: typeof s[0].followers_count === 'number' ? s[0].followers_count : null,
      avatar: s[0].profile_image_url_https || null,
      url: 'https://x.com/' + (s[0].screen_name || handle),
      note: null,
    };
  }
  return null;
}

async function readYouTube(p) {
  const html = await text('https://www.youtube.com' + (p.path || '/@' + p.handle), 8000);
  if (!html) return null;
  const idm = html.match(/"(?:externalId|channelId)":"(UC[\w-]{20,})"/);
  const subs = html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/) ||
               html.match(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/);
  const name = meta(html, 'og:title') || (html.match(/"title":"([^"]+)","(?:description|channelId)"/) || [])[1];
  return {
    name: name || null,
    id: idm ? idm[1] : null,
    followers: subs ? count(subs[1]) : null,
    avatar: meta(html, 'og:image'),
    url: 'https://www.youtube.com' + (p.path || '/@' + p.handle),
    note: idm ? null : 'YouTube did not return a channel ID to this server.',
  };
}

async function readTikTok(p) {
  const html = await text('https://www.tiktok.com/@' + encodeURIComponent(p.handle), 8000);
  if (!html) return null;
  const idm = html.match(/"authorId":"(\d{6,})"/) || html.match(/"id":"(\d{15,})"/);
  const fol = html.match(/"followerCount":(\d+)/);
  return {
    name: meta(html, 'og:title') ? meta(html, 'og:title').replace(/\s*\|.*$/, '') : null,
    id: idm ? idm[1] : null,
    followers: fol ? parseInt(fol[1], 10) : null,
    avatar: meta(html, 'og:image'),
    url: 'https://www.tiktok.com/@' + p.handle,
    note: idm ? null : 'TikTok served this page without an account ID.',
  };
}

async function readInstagram(p) {
  const html = await text('https://www.instagram.com/' + encodeURIComponent(p.handle) + '/', 8000);
  const d = meta(html, 'og:description');
  return {
    name: meta(html, 'og:title') ? meta(html, 'og:title').replace(/\s*[•|].*$/, '').trim() : null,
    id: (html && (html.match(/"profilePage_(\d+)"/) || [])[1]) || null,
    followers: d ? count(d) : null,
    avatar: meta(html, 'og:image'),
    url: 'https://www.instagram.com/' + p.handle + '/',
    note: html ? null : 'Instagram refused the server read. The pairing still holds — the claim is checked in the browser.',
  };
}

async function readTwitch(p) {
  const id = await text('https://decapi.me/twitch/id/' + encodeURIComponent(p.handle), 6000);
  const av = await text('https://decapi.me/twitch/avatar/' + encodeURIComponent(p.handle), 6000);
  const fol = await text('https://decapi.me/twitch/followcount/' + encodeURIComponent(p.handle), 6000);
  const ok = id && /^\d+$/.test(id.trim());
  if (!ok && !(av && /^https?:/.test(av.trim()))) return null;
  return {
    name: null,
    id: ok ? id.trim() : null,
    followers: fol && /^\d+$/.test(fol.trim()) ? parseInt(fol.trim(), 10) : null,
    avatar: av && /^https?:/.test(av.trim()) ? av.trim() : null,
    url: 'https://twitch.tv/' + p.handle,
    note: ok ? null : 'Twitch did not return an account ID to this server.',
  };
}

async function readKick(p) {
  let j = await json('https://kick.com/api/v2/channels/' + encodeURIComponent(p.handle), 7000);
  if (!j) j = await json('https://kick.com/api/v1/channels/' + encodeURIComponent(p.handle), 7000);
  if (!j) {
    return {
      name: null, id: null, followers: null, avatar: null,
      url: 'https://kick.com/' + p.handle,
      note: 'Kick refused the server read. The pairing still holds — the claim is checked against the posted code.',
    };
  }
  const u = j.user || {};
  return {
    name: u.username || j.slug || null,
    id: j.user_id ? String(j.user_id) : (j.id ? String(j.id) : null),
    followers: typeof j.followers_count === 'number' ? j.followers_count : null,
    avatar: u.profile_pic || (j.user && j.user.profile_pic) || null,
    url: 'https://kick.com/' + (j.slug || p.handle),
    note: null,
  };
}

async function readOther(p) {
  const html = await text('https://' + (p.host || p.handle) + '/', 7000);
  if (!html) return null;
  return {
    name: meta(html, 'og:site_name') || meta(html, 'og:title') || null,
    id: null,
    followers: null,
    avatar: meta(html, 'og:image'),
    url: 'https://' + (p.host || p.handle) + '/',
    note: 'This is not one of the six platforms. There is no account ID to bind a claim to, and the coin page will say so.',
  };
}

module.exports = async (req, res) => {
  const q = (req.query && (req.query.u || req.query.url)) || '';
  const p = parse(q);
  if (!p || !p.handle) {
    res.status(400).json({ ok: false, error: 'Paste a profile link from X, YouTube, TikTok, Instagram, Twitch or Kick.' });
    return;
  }

  let r = null;
  try {
    if (p.platform === 'x') r = await readX(p.handle);
    else if (p.platform === 'youtube') r = await readYouTube(p);
    else if (p.platform === 'tiktok') r = await readTikTok(p);
    else if (p.platform === 'instagram') r = await readInstagram(p);
    else if (p.platform === 'twitch') r = await readTwitch(p);
    else if (p.platform === 'kick') r = await readKick(p);
    else r = await readOther(p);
  } catch (e) { r = null; }

  res.setHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=3600');

  if (!r) {
    res.status(200).json({
      ok: false,
      platform: p.platform,
      platformLabel: LABEL[p.platform] || p.platform,
      handle: p.handle,
      error: LABEL[p.platform] + ' did not answer for @' + p.handle + '. Either the account does not exist or the platform refused this server.',
    });
    return;
  }

  const empty = !r.name && !r.id && r.followers == null && !r.avatar;
  if (empty && !r.note) {
    r.note = LABEL[p.platform] + ' served this page without a name, an account ID, a ' +
      'follower count or a picture. The pairing still holds — the claim is checked ' +
      'against the posted code — but there is nothing here to show you.';
  }

  res.status(200).json({
    ok: true,
    platform: p.platform,
    platformLabel: LABEL[p.platform] || p.platform,
    handle: p.handle,
    name: r.name || null,
    id: r.id || null,
    followers: typeof r.followers === 'number' ? r.followers : null,
    avatar: r.avatar || null,
    url: r.url,
    note: r.note || null,
    bindable: !!r.id,
  });
};
