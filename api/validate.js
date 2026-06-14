import { Redis } from '@upstash/redis';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { hwid, key } = req.body ?? {};
  if (typeof hwid !== 'string' || typeof key !== 'string') {
    return res.status(400).json({ valid: false });
  }

  const user = await redis.get(`user:${hwid}`);
  if (!user || user.key !== key) {
    return res.status(200).json({ valid: false, reason: 'unknown' });
  }

  const valid = user.expires_at > Date.now();
  return res.status(200).json({ valid, expires_at: user.expires_at });
}
