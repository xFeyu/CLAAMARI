import { Redis } from '@upstash/redis';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KA_OWNER = 'OH1YXnCWPY'; // <-- paste your owner id

async function issueKeyauthLicense() {
  const url = `https://keyauth.win/api/seller/?sellerkey=${process.env.KEYAUTH_SELLER_KEY}`
            + `&type=add`
            + `&expiry=1`         // 1 day
            + `&mask=******-******-******-******`
            + `&level=1`
            + `&amount=1`
            + `&owner=${KA_OWNER}`
            + `&character=2`
            + `&format=JSON`;
  const r = await fetch(url);
  const j = await r.json();
  if (!j.success) throw new Error(j.message || 'keyauth failed');
  return j.key;
}

async function validateWorkInkToken(t) {
  // deleteToken=1 → one-shot, work.ink invalidates after this call
  const r = await fetch(
    `https://work.ink/_api/v2/token/isValid/${encodeURIComponent(t)}?deleteToken=1`
  );
  if (!r.ok) return false;
  const j = await r.json();
  return j.valid === true;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const t = req.query.t;
  if (!t || typeof t !== 'string' || t.length < 8) {
    return res.status(400).json({ error: 'missing token' });
  }

  // Extra dedup — even if work.ink fails to invalidate, our KV remembers it
  const usedKey = `usedt:${t}`;
  const wasUsed = await redis.get(usedKey);
  if (wasUsed) return res.status(403).json({ error: 'token already used' });

  // Step 1: validate UUID via work.ink (this consumes the token there)
  let ok = false;
  try { ok = await validateWorkInkToken(t); } catch { ok = false; }
  if (!ok) return res.status(403).json({ error: 'invalid or expired token' });

  // Mark used for 24h so the same UUID can't be replayed even if work.ink hiccups
  await redis.set(usedKey, '1', { ex: 86400 });

  // Step 2: generate a fresh KeyAuth 24h license
  try {
    const license = await issueKeyauthLicense();
    return res.status(200).json({ key: license });
  } catch (e) {
    return res.status(500).json({ error: 'keyauth failed: ' + e.message });
  }
}
