import { getStore } from "@netlify/blobs";
import type { Context, Config } from "@netlify/functions";

/*
  Storage layout (store "gloss"):
    head/{id}        small JSON describing a document: title, rev, list of text versions, current guide hash
    ver/{id}/{hash}  one version of the document text (immutable)
    pack/{id}/{hash} one version of the guide JSON (immutable; the head points at the current one)
  Immutable keys mean an upload can never overwrite data another device depends on.
  The head carries a revision number; a PUT must name the revision it was based on,
  otherwise it gets 409 with the current head so the client can merge.
*/

type Store = ReturnType<typeof getStore>;
const ID = /^[a-z0-9]{6,40}$/;
const HASH = /^[a-z0-9]{1,40}$/;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// SHA-256 of the sync key. The key itself is never stored here; only devices that know it can sync.
const KEY_SHA256 = "REMOVED-FROM-HISTORY";

async function sha256hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function route(req: Request, store: Store, token?: string): Promise<Response> {
  // Fail closed: a SYNC_TOKEN environment variable overrides the built-in fingerprint; with neither, sync is off.
  const expected = token ? await sha256hex(token) : KEY_SHA256;
  if (!expected) return json({ error: "sync not configured" }, 503);
  if (!safeEqual(await sha256hex(req.headers.get("x-sync-token") || ""), expected)) return json({ error: "unauthorized" }, 401);
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/sync\/?/, "").split("/").filter(Boolean);
  const [kind, id, hash] = parts;
  const method = req.method;

  if (kind === "ping") return json({ ok: true, v: 1 });

  if (kind === "list" && method === "GET") {
    const { blobs } = await store.list({ prefix: "head/" });
    const heads = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    return json(heads.filter(Boolean));
  }

  // flashcard decks: one JSON object per text, merged card by card on the client
  if (kind === "decks" && method === "GET") {
    const { blobs } = await store.list({ prefix: "deck/" });
    return json(blobs.map((b) => ({ id: b.key.slice(5), etag: b.etag })));
  }

  if (!id || !ID.test(id)) return json({ error: "bad id" }, 400);

  if (kind === "deck") {
    const key = `deck/${id}`;
    if (method === "GET") {
      const r = await store.getWithMetadata(key, { type: "text" });
      return r ? new Response(r.data, { headers: { "content-type": "application/json", "cache-control": "no-store", etag: r.etag } }) : json({ error: "not found" }, 404);
    }
    if (method === "PUT") {
      const text = await req.text();
      try { JSON.parse(text); } catch { return json({ error: "bad json" }, 400); }
      await store.set(key, text);
      const m = await store.getMetadata(key);
      return json({ ok: true, etag: m?.etag || "" });
    }
  }

  if (kind === "head") {
    const key = `head/${id}`;
    if (method === "GET") {
      const h = await store.get(key, { type: "json" });
      return h ? json(h) : json({ error: "not found" }, 404);
    }
    if (method === "PUT") {
      let body: any;
      try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
      if (!body || body.id !== id || typeof body.rev !== "number") return json({ error: "bad head" }, 400);
      const cur: any = await store.get(key, { type: "json" });
      const base = Number(req.headers.get("x-base-rev") ?? "0");
      if (cur && cur.rev !== base) return json(cur, 409);
      if (body.rev !== base + 1) return json({ error: "rev must be base + 1" }, 400);
      await store.setJSON(key, body);
      if (body.deleted) {
        // tombstone: keep the small head so other devices learn about the deletion, drop the content
        for (const prefix of [`ver/${id}/`, `pack/${id}/`]) {
          const { blobs } = await store.list({ prefix });
          await Promise.all(blobs.map((b) => store.delete(b.key)));
        }
      } else if (cur && cur.packHash && cur.packHash !== body.packHash && HASH.test(cur.packHash)) {
        await store.delete(`pack/${id}/${cur.packHash}`); // superseded guide
      }
      return json({ ok: true, rev: body.rev });
    }
  }

  if ((kind === "ver" || kind === "pack") && hash && HASH.test(hash)) {
    const key = `${kind}/${id}/${hash}`;
    const type = kind === "ver" ? "text/markdown; charset=utf-8" : "application/json";
    if (method === "GET") {
      const data = await store.get(key, { type: "text" });
      return data == null ? json({ error: "not found" }, 404) : new Response(data, { headers: { "content-type": type, "cache-control": "no-store" } });
    }
    if (method === "PUT") {
      await store.set(key, await req.text());
      return json({ ok: true });
    }
  }

  return json({ error: "not found" }, 404);
}

export default async (req: Request, context: Context) => {
  const store = getStore({ name: "gloss", consistency: "strong" });
  return route(req, store, Netlify.env.get("SYNC_TOKEN") || undefined);
};

export const config: Config = {
  path: "/api/sync/*",
};
