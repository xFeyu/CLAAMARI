import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const { token, signature, user_ip } = req.query;
  if (!token || !signature) return res.status(400).send('bad request');

  const expected = crypto
    .createHmac('sha256', process.env.WORKINK_POSTBACK_SECRET)
    .update(String(token))
    .digest('hex');

  if (expected !== signature) return res.status(403).send('bad sig');

  await redis.set(`wi:${token}`, JSON.stringify({ ip: user_ip || '', ts: Date.now() }), {
    ex: 600,
  });

  return res.status(200).send('ok');
}
