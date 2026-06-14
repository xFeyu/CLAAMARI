import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY_HOURS = 2;

async function validateWorkInkToken(t) {
  const r = await fetch(`https://work.ink/_api/v2/token/isValid/${encodeURIComponent(t)}?deleteToken=1`);
  if (!r.ok) return false;
  const j = await r.json();
  return j.valid === true;
}

function makeKey() {
  return 'HX-' + crypto.randomBytes(12).toString('hex').toUpperCase();
}

function page(title, body) {
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title>'
    + '<style>body{background:#0c0c10;color:#e0e0e8;font-family:Segoe UI,sans-serif;'
    + 'display:flex;align-items:center;justify-content:center;height:100vh;margin:0}'
    + '.card{background:#16161c;border:1px solid #2a2a36;border-radius:12px;'
    + 'padding:28px 36px;text-align:center;max-width:460px}'
    + 'h1{margin:0 0 10px;color:#ac26d6;font-size:20px}'
    + 'p{margin:0 0 14px;color:#a0a0b0;font-size:14px;line-height:1.5}'
    + '.key{background:#0a0a0e;border:1px solid #2a2a36;border-radius:8px;'
    + 'padding:14px;font-family:Consolas,monospace;color:#e8e8f0;'
    + 'font-size:15px;letter-spacing:1px;margin-bottom:12px;user-select:all}'
    + 'button{background:#ac26d6;color:#fff;border:0;border-radius:6px;'
    + 'padding:9px 18px;font-size:14px;cursor:pointer}</style></head><body>'
    + '<div class="card"><h1>' + title + '</h1>' + body + '</div></body></html>';
}

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).send(page('Invalid Link', '<p>No token in URL.</p>'));
  }

  const tokenKey = 'wi_token:' + token;
  if (await redis.get(tokenKey)) {
    return res.status(409).send(page('Already Used',
      '<p>This work.ink token was already redeemed. Complete the offer again to get a new key.</p>'));
  }
  if (!(await validateWorkInkToken(token))) {
    return res.status(403).send(page('Invalid Token',
      '<p>work.ink did not confirm this offer was completed.</p>'));
  }
  await redis.set(tokenKey, '1', { ex: 8 * 60 * 60 });

  const key = makeKey();
  const expires_at = Date.now() + KEY_HOURS * 60 * 60 * 1000;
  await redis.set('key:' + key, { expires_at }, { ex: KEY_HOURS * 60 * 60 });

  const body =
    '<p>Your key is valid for ' + KEY_HOURS + ' hours.</p>'
    + '<div class="key">' + key + '</div>'
    + '<button onclick="navigator.clipboard.writeText(\'' + key + '\');this.textContent=\'Copied!\'">Copy</button>'
    + '<p style="margin-top:14px;font-size:12px;color:#7a7a8a">Paste this into Helix and you are good to go.</p>';
  return res.status(200).send(page('Xuro Key', body));
}
