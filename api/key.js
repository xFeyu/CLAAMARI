import { Redis } from '@upstash/redis';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KA_NAME  = 'Calamari';
const KA_OWNER = 'YOUR_KEYAUTH_OWNER_ID'; // <-- paste your owner id

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

function htmlPage(license) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Xuro Key</title>
<style>body{background:#0e0e10;color:#eee;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:#1a1a1f;padding:36px 42px;border:1px solid #2a2a32;border-radius:10px;text-align:center}
.k{font-family:monospace;font-size:22px;color:#9b59ff;margin:18px 0;letter-spacing:1px}
.ok{color:#33d17a;font-size:13px}</style></head>
<body><div class="box">
<div>Your Xuro key (valid 24h)</div>
<div class="k" id="k">${license}</div>
<div class="ok" id="ok">copied to clipboard</div>
<script>
navigator.clipboard.writeText(${JSON.stringify(license)}).catch(()=>{
  document.getElementById('ok').textContent='copy manually'});
</script></div></body></html>`;
}

export default async function handler(req, res) {
  const { t } = req.query;
  if (!t) return res.status(400).send('missing token — redo the locker');

  const recKey = `wi:${t}`;
  const rec = await redis.get(recKey);
  if (!rec) return res.status(403).send('invalid or expired link — redo the locker');

  await redis.del(recKey);

  try {
    const license = await issueKeyauthLicense();
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlPage(license));
  } catch (e) {
    return res.status(500).send('key issue failed: ' + e.message);
  }
}
