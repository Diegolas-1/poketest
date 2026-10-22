// pallet-patches: serves the native game's patch manifests and packs from R2.
//
//   GET /manifest.json?ch=stable        the channel's live manifest (no-cache)
//   GET /manifest.json?ch=stable&v=12   an older one (history, for rollback)
//   GET /history.json?ch=stable         every version published on the channel
//   GET /packs/<name>-<hash>.pck        a pack (immutable; Range for resuming)
//
// R2 layout: manifests/<ch>.json, manifests/<ch>/<v>.json,
// manifests/<ch>/index.json, packs/<name>-<hash>.pck. No write endpoint.

const PACK = /^\/packs\/[a-z0-9_]+-[0-9a-f]{12,64}\.pck$/;

export default {
  async fetch(req, env) {
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return new Response('method not allowed\n', { status: 405, headers: { allow: 'GET, HEAD' } });
    const url = new URL(req.url);
    const ch = (url.searchParams.get('ch') || 'stable').toLowerCase();
    if (!/^[a-z0-9_-]{1,32}$/.test(ch)) return text('bad channel', 400);
    let key, pack = false;
    if (url.pathname === '/manifest.json') {
      const v = url.searchParams.get('v');
      if (v !== null && !/^\d{1,9}$/.test(v)) return text('bad version', 400);
      key = v === null ? `manifests/${ch}.json` : `manifests/${ch}/${v}.json`;
    } else if (url.pathname === '/history.json') key = `manifests/${ch}/index.json`;
    else if (PACK.test(url.pathname)) { key = url.pathname.slice(1); pack = true; }
    else if (url.pathname === '/') return text('Pallet Town patches: /manifest.json?ch=stable');
    else return text('not found', 404);

    const h = new Headers();
    h.set('access-control-allow-origin', '*');
    h.set('cache-control', pack ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate');
    if (pack) h.set('accept-ranges', 'bytes');
    if (req.method === 'HEAD') {
      const o = await env.PATCHES.head(key);
      if (!o) return text('not found', 404);
      o.writeHttpMetadata(h);
      h.set('etag', o.httpEtag);
      h.set('content-length', String(o.size));
      setCache(h, pack);
      return new Response(null, { headers: h });
    }
    const ranged = pack && req.headers.has('range');
    let o;
    try {
      o = await env.PATCHES.get(key, ranged ? { range: req.headers } : undefined);
    } catch (e) {
      return text('range not satisfiable', 416);
    }
    if (!o) return text('not found', 404);
    o.writeHttpMetadata(h);
    setCache(h, pack);
    h.set('etag', o.httpEtag);
    if (!pack) h.set('content-type', 'application/json; charset=utf-8');
    if (ranged && o.range) {
      let off, len;
      const r = o.range;
      if (r.suffix != null) { len = Math.min(r.suffix, o.size); off = o.size - len; }
      else { off = r.offset ?? 0; len = Math.min(r.length ?? o.size - off, o.size - off); }
      h.set('content-range', `bytes ${off}-${off + len - 1}/${o.size}`);
      h.set('content-length', String(len));
      return new Response(o.body, { status: 206, headers: h });
    }
    h.set('content-length', String(o.size));
    return new Response(o.body, { headers: h });
  },
};

// the object's own metadata must not override the cache rules above
function setCache(h, pack) {
  h.set('cache-control', pack ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate');
}

function text(s, status = 200) {
  return new Response(s + '\n', { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
