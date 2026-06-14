import { Redis } from '@upstash/redis';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { key } = req.body ?? {};
  if (typeof key !== 'string' || !key.startsWith('HX-')) {
    return res.status(200).json({ valid: false });
  }

  const entry = await redis.get(`key:${key}`);
  if (!entry) return res.status(200).json({ valid: false });

  const valid = entry.expires_at > Date.now();
  return res.status(200).json({ valid, expires_at: entry.expires_at });
}
