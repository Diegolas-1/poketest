// pallet-editor: storage for the world editor (web/world/editor.html).
//
// Everything is in R2 (bucket pallet-editor):
//   draft.json            the working draft: a bundle { doc, tiles, life, meta }
//                         (doc = web/world/edits/world.json, tiles = base64 PNGs
//                         of web/world/edits/tiles/, life = edited
//                         native/life/*.json with the base they were edited from)
//   versions/<id>.json    saved versions (a copy of the draft at "Save version")
//   index.json            { seq, versions: [{ id, at, message, size, parent }],
//                           requests: [{ id, version, message, at, status, ... }] }
//   lock.json             the publisher's lease (tools/editor/publish.mjs)
// index.json and lock.json are changed with conditional writes (etag), so two
// writers never lose each other's changes.
//
// API (every call needs Authorization: Bearer <EDITOR_TOKEN>):
//   GET  /api/ping
//   GET  /api/draft                 PUT /api/draft (bundle)
//   GET  /api/versions              POST /api/versions { message } -> the draft saved as a version
//   GET  /api/versions/<id>
//   GET  /api/requests              POST /api/requests { version, message } (Publish to phone)
//   POST /api/requests/<id>         { status, log, result } (the publisher's report)
//   POST /api/lock { owner, ttl }   DELETE /api/lock { owner }   (the publisher's lease)
// Optional: with a GITHUB_TOKEN secret (a fine-grained token with contents
// write on the repo), POST /api/commit { version, message } writes the files
// straight to GitHub. Without it the publisher (pull.mjs) does that.

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, PUT, POST, DELETE, OPTIONS' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } });
const err = (m, status = 400) => json({ error: m }, status);

async function same(a, b) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', ea), crypto.subtle.digest('SHA-256', eb)]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

// read-modify-write index.json with an etag check (retried on a race)
async function withIndex(env, fn) {
  for (let i = 0; i < 8; i++) {
    const o = await env.BUCKET.get('index.json');
    const idx = o ? await o.json() : { seq: 0, versions: [], requests: [] };
    const res = await fn(idx);
    const body = JSON.stringify(idx);
    const put = await env.BUCKET.put('index.json', body, o ? { onlyIf: { etagMatches: o.etag } } : { onlyIf: { etagDoesNotMatch: '*' } });
    if (put) return res;
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
  }
  throw new Error('index busy');
}
const readIndex = async (env) => { const o = await env.BUCKET.get('index.json'); return o ? o.json() : { seq: 0, versions: [], requests: [] }; };

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url), p = url.pathname.replace(/\/+$/, '');
    if (p === '' || p === '/') return new Response('pallet-editor: the world editor\'s storage. Open the editor at /poketest/world/editor.html', { headers: CORS });
    if (!env.EDITOR_TOKEN) return err('EDITOR_TOKEN not set', 500);
    const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!auth || !(await same(auth, env.EDITOR_TOKEN))) return err('wrong passphrase', 401);
    try {
      if (p === '/api/ping') return json({ ok: true, github: !!env.GITHUB_TOKEN });
      if (p === '/api/draft' && req.method === 'GET') {
        const o = await env.BUCKET.get('draft.json');
        return o ? new Response(o.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', etag: o.etag, ...CORS } }) : err('no draft', 404);
      }
      if (p === '/api/draft' && req.method === 'PUT') {
        const body = await req.text();
        JSON.parse(body);
        if (body.length > 60e6) return err('too big', 413);
        const o = await env.BUCKET.put('draft.json', body);
        return json({ ok: true, at: Date.now(), size: body.length, etag: o.etag });
      }
      if (p === '/api/versions' && req.method === 'GET') return json((await readIndex(env)).versions);
      if (p === '/api/versions' && req.method === 'POST') {
        const { message = '' } = await req.json();
        const d = await env.BUCKET.get('draft.json');
        if (!d) return err('no draft to save');
        const body = await d.text();
        const v = await withIndex(env, async (idx) => {
          const id = ++idx.seq;
          const parent = idx.versions.length ? idx.versions[idx.versions.length - 1].id : null;
          const e = { id, at: Date.now(), message: String(message).slice(0, 500), size: body.length, parent };
          idx.versions.push(e);
          return e;
        });
        await env.BUCKET.put(`versions/${v.id}.json`, body);
        return json(v);
      }
      let m = /^\/api\/versions\/(\d+)$/.exec(p);
      if (m && req.method === 'GET') {
        const o = await env.BUCKET.get(`versions/${m[1]}.json`);
        return o ? new Response(o.body, { headers: { 'content-type': 'application/json', ...CORS } }) : err('no such version', 404);
      }
      if (p === '/api/requests' && req.method === 'GET') return json((await readIndex(env)).requests.slice(-50));
      if (p === '/api/requests' && req.method === 'POST') {
        const { version, message = '' } = await req.json();
        const r = await withIndex(env, async (idx) => {
          if (!idx.versions.some((v) => v.id === +version)) throw new Error('no such version');
          const id = ++idx.seq;
          const e = { id, version: +version, message: String(message).slice(0, 500), at: Date.now(), status: 'pending', log: [] };
          idx.requests.push(e);
          if (idx.requests.length > 200) idx.requests.splice(0, idx.requests.length - 200);
          return e;
        });
        return json(r);
      }
      m = /^\/api\/requests\/(\d+)$/.exec(p);
      if (m && req.method === 'POST') {
        const b = await req.json();
        const r = await withIndex(env, async (idx) => {
          const e = idx.requests.find((x) => x.id === +m[1]);
          if (!e) throw new Error('no such request');
          if (b.status) e.status = String(b.status);
          if (b.log) e.log = [...(e.log || []), ...[].concat(b.log).map((l) => ({ at: Date.now(), t: String(l).slice(0, 4000) }))].slice(-60);
          if (b.result !== undefined) e.result = b.result;
          e.updated = Date.now();
          return e;
        });
        return json(r);
      }
      if (p === '/api/lock') {
        const b = await req.json().catch(() => ({}));
        const o = await env.BUCKET.get('lock.json');
        const cur = o ? await o.json() : null;
        if (req.method === 'POST') {
          if (cur && cur.expires > Date.now() && cur.owner !== b.owner) return json({ ok: false, held: cur }, 409);
          const lease = { owner: String(b.owner || 'anon'), at: Date.now(), expires: Date.now() + Math.min(4 * 3600e3, +b.ttl || 3600e3) };
          const put = await env.BUCKET.put('lock.json', JSON.stringify(lease), o ? { onlyIf: { etagMatches: o.etag } } : { onlyIf: { etagDoesNotMatch: '*' } });
          return put ? json({ ok: true, lease }) : json({ ok: false, race: true }, 409);
        }
        if (req.method === 'DELETE') {
          if (cur && cur.owner === b.owner) await env.BUCKET.delete('lock.json');
          return json({ ok: true });
        }
        if (req.method === 'GET') return json({ lock: cur });
      }
      if (p === '/api/commit' && req.method === 'POST') {
        if (!env.GITHUB_TOKEN) return err('no GITHUB_TOKEN secret: the publisher (tools/editor/publish.mjs) commits instead', 501);
        return err('direct commits are not wired yet: use tools/editor/publish.mjs', 501);
      }
      return err('not found', 404);
    } catch (e) { return err(String(e.message || e), 500); }
  },
};
