import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ valid: false, message: 'Method Not Allowed' });
  }

  const { key, hwid } = req.body ?? {};

  if (!key || typeof key !== 'string') {
    return res.status(200).json({ valid: false, message: 'Key is required' });
  }

  const apiKey = process.env.PWF_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ valid: false, message: 'PWF_API_KEY is not configured on the server' });
  }

  try {
    // Query PWF Auth Developer API for key details
    const pwfRes = await fetch(`https://pwfauth.com/api/v1/keys/${encodeURIComponent(key.trim())}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (pwfRes.status === 404) {
      return res.status(200).json({ valid: false, message: 'Key does not exist' });
    }

    if (!pwfRes.ok) {
      const errText = await pwfRes.text();
      return res.status(502).json({ valid: false, message: `PWF Auth returned status ${pwfRes.status}: ${errText}` });
    }

    const data = await pwfRes.json();

    // 1. Status check
    if (data.status && data.status.toLowerCase() !== 'active') {
      return res.status(200).json({ valid: false, message: `Key status is ${data.status}` });
    }

    // 2. Expiration check
    if (data.hours_left !== undefined && data.hours_left <= 0) {
      return res.status(200).json({ valid: false, message: 'Key has expired' });
    }
    if (data.expires_at) {
      const expTime = new Date(data.expires_at).getTime();
      if (!isNaN(expTime) && expTime <= Date.now()) {
        return res.status(200).json({ valid: false, message: 'Key has expired' });
      }
    }

    // 3. HWID Lock validation (if HWID is provided by client)
    if (hwid && typeof hwid === 'string') {
      // Check Redis pre-bound HWID if present
      if (redis) {
        const boundHwid = await redis.get('hwid:' + key);
        if (boundHwid && boundHwid !== hwid) {
          return res.status(200).json({ valid: false, message: 'HWID mismatch: Key bound to another machine' });
        }
      }

      // Check PWF Auth device list if devices have already been registered
      if (Array.isArray(data.pcs) && data.pcs.length > 0) {
        const matchesAnyDevice = data.pcs.some(device => device.hwid === hwid);
        if (!matchesAnyDevice) {
          return res.status(200).json({ valid: false, message: 'HWID mismatch: Key bound to another machine' });
        }
      }
    }

    return res.status(200).json({
      valid: true,
      key: data.key,
      hours_left: data.hours_left,
      expires_at: data.expires_at,
      status: data.status,
    });
  } catch (error) {
    console.error('Validation error:', error);
    return res.status(500).json({ valid: false, message: error.message });
  }
}
