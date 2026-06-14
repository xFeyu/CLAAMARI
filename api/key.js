import { Redis } from '@upstash/redis';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const HOURS_PER_COMPLETION = 2;
const COOLDOWN_HOURS       = 3;

async function validateWorkInkToken(t) {
  const r = await fetch(`https://work.ink/_api/v2/token/isValid/${encodeURIComponent(t)}?deleteToken=1`);
  if (!r.ok) return false;
  const j = await r.json();
  return j.valid === true;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function htmlMsg(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{background:#0c0c10;color:#e0e0e8;font-family:Segoe UI,sans-serif;
  display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .card{background:#16161c;border:1px solid #2a2a36;border-radius:12px;
  padding:28px 36px;text-align:center;max-width:420px}
  h1{margin:0 0 10px;color:#ac26d6;font-size:20px}
  p{margin:0;color:#a0a0b0;font-size:14px;line-height:1.5}</style>
  </head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}

export default async function handler(req, res) {
  const { token } = req.query;
  const hwid = readCookie(req, 'hx_hwid');

  if (!token || typeof token !== 'string') {
    return res.status(400).send(htmlMsg('Invalid Link', 'No token in URL.'));
  }
  if (!hwid) {
    return res.status(400).send(htmlMsg('Session Lost',
      'Open the "Get Key" button from Helix again, then complete the offer.'));
  }

  // Prevent token reuse (8h window).
  const tokenKey = `wi_token:${token}`;
  const seen = await redis.get(tokenKey);
  if (seen) {
    return res.status(409).send(htmlMsg('Already Used',
      'This work.ink token was already redeemed.'));
  }
  if (!await validateWorkInkToken(token)) {
    return res.status(403).send(htmlMsg('Invalid Token',
      'work.ink did not confirm this offer was completed.'));
  }
  await redis.set(tokenKey, '1', { ex: 8 * 60 * 60 });

  const userKey = `user:${hwid}`;
  const user = await redis.get(userKey);
  if (!user) {
    return res.status(404).send(htmlMsg('No Account',
      'No user record for this HWID. Launch Helix once first, then redeem.'));
  }

  const now = Date.now();
  const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;

  if (user.last_redeem_at && now - user.last_redeem_at < cooldownMs) {
    const remainingMin = Math.ceil((cooldownMs - (now - user.last_redeem_at)) / 60000);
    return res.status(429).send(htmlMsg('Cooldown',
      `You can redeem again in ${remainingMin} minutes.`));
  }

  const addMs = HOURS_PER_COMPLETION * 60 * 60 * 1000;
  user.expires_at    = Math.max(now, user.expires_at) + addMs;
  user.last_redeem_at = now;
  await redis.set(userKey, user);

  const hoursLeft = Math.round((user.expires_at - now) / 3600000 * 10) / 10;
  return res.status(200).send(htmlMsg('Time Added',
    `+${HOURS_PER_COMPLETION}h applied. You now have ${hoursLeft}h on your key.<br>You can close this tab and return to Helix.`));
}
