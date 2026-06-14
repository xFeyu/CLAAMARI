import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function makeKey() {
  return 'HX-' + crypto.randomBytes(12).toString('hex').toUpperCase();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { hwid } = req.body ?? {};
  if (typeof hwid !== 'string' || hwid.length < 16) {
    return res.status(400).json({ error: 'invalid hwid' });
  }

  const id = `user:${hwid}`;
  let user = await redis.get(id);
  if (!user) {
    user = { key: makeKey(), expires_at: 0, last_redeem_at: 0 };
    await redis.set(id, user);
  }
  return res.status(200).json({ key: user.key, expires_at: user.expires_at });
}
