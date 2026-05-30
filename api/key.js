import { Redis } from '@upstash/redis';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KA_OWNER = 'OH1YXnCWPY'; // <-- paste your owner id

async function issueKeyauthLicense() {
  const url = `https://keyauth.win/api/seller/?sellerkey=${process.env.KEYAUTH_SELLER_KEY}`
            + `&type=add`
            + `&expiry=1`
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
  const r = await fetch(
    `https://work.ink/_api/v2/token/isValid/${encodeURIComponent(t)}?deleteToken=1`
  );
  if (!r.ok) return false;
  const j = await r.json();
  return j.valid === true;
}

function htmlOk(license) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Xuro Key</title>
<style>body{background:#0e0e10;color:#eee;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:#1a1a1f;padding:40px 48px;border:1px solid #2a2a32;border-radius:12px;text-align:center;min-width:340px}
.t{font-size:13px;color:#9b9ba0;letter-spacing:.5px;text-transform:uppercase;margin-bottom:14px}
.k{font-family:'Consolas',monospace;font-size:24px;color:#9b59ff;letter-spacing:2px;margin:0 0 18px;user-select:all}
.ok{color:#33d17a;font-size:13px;margin-top:8px}
.h{color:#7a7a82;font-size:12px;margin-top:18px}</style></head>
<body><div class="box">
<div class="t">Your Xuro Key (24h)</div>
<div class="k" id="k">${license}</div>
<div class="ok" id="ok">copied to clipboard — paste in Xuro</div>
<div class="h">Open Xuro and the key auto-fills. Valid for 24 hours.</div>
<script>
navigator.clipboard.writeText(${JSON.stringify(license)}).catch(()=>{
  document.getElementById('ok').textContent='copy manually'});
</script></div></body></html>`;
}

function htmlErr(msg) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Xuro Key</title>
<style>body{background:#0e0e10;color:#eee;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.box{background:#1a1a1f;padding:36px 42px;border:1px solid #2a2a32;border-radius:12px}
.t{color:#ff5466;font-size:16px;margin-bottom:12px}
.s{color:#9b9ba0;font-size:13px}</style></head>
<body><div class="box"><div class="t">${msg}</div>
<div class="s">Redo the locker at <b>work.ink/2Cm2/xuro-key</b> to get a fresh key.</div>
</div></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const t = req.query.t;
  if (!t || typeof t !== 'string' || t.length < 8) {
    return res.status(400).send(htmlErr('Missing token.'));
  }

  const usedKey = `usedt:${t}`;
  if (await redis.get(usedKey)) {
    return res.status(403).send(htmlErr('Token already used.'));
  }

  let ok = false;
  try { ok = await validateWorkInkToken(t); } catch { ok = false; }
  if (!ok) {
    return res.status(403).send(htmlErr('Invalid or expired token.'));
  }

  await redis.set(usedKey, '1', { ex: 86400 });

  try {
    const license = await issueKeyauthLicense();
    return res.status(200).send(htmlOk(license));
  } catch (e) {
    return res.status(500).send(htmlErr('KeyAuth issue failed: ' + e.message));
  }
}
