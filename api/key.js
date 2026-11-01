import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const KEY_HOURS = 12;

async function validateWorkInkToken(token) {
  const res = await fetch(`https://work.ink/_api/v2/token/isValid/${encodeURIComponent(token)}?deleteToken=1`);
  if (!res.ok) return false;
  const data = await res.json();
  return data.valid === true;
}

async function createPwfKey(durationHours = KEY_HOURS) {
  const apiKey = process.env.PWF_API_KEY;
  if (!apiKey) {
    throw new Error('PWF_API_KEY environment variable is missing.');
  }

  const res = await fetch('https://pwfauth.com/api/v1/keys', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      count: 1,
      type: 'hours',
      duration: durationHours,
      length: durationHours,
      max_devices: 1,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PWF Auth error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const key =
    data.keys?.[0]?.key ||
    data.keys?.[0] ||
    data.key ||
    data.data?.[0]?.key;

  if (!key) {
    throw new Error('No key received from PWF Auth.');
  }

  return key;
}

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background: #0c0c10;
      color: #e0e0e8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background: #16161c;
      border: 1px solid #2a2a36;
      border-radius: 14px;
      padding: 32px 28px;
      text-align: center;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
    }
    h1 {
      margin: 0 0 12px;
      color: #a855f7;
      font-size: 22px;
      font-weight: 700;
    }
    p {
      margin: 0 0 16px;
      color: #9ca3af;
      font-size: 14px;
      line-height: 1.6;
    }
    .badge-row {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 18px;
    }
    .badge {
      background: #242433;
      border: 1px solid #3b3b4f;
      color: #c084fc;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
    }
    .key-box {
      background: #0a0a0e;
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 14px 12px;
      font-family: Consolas, "Courier New", monospace;
      color: #f3f4f6;
      font-size: 15px;
      letter-spacing: 0.5px;
      word-break: break-all;
      margin-bottom: 16px;
      user-select: all;
    }
    .btn {
      background: #9333ea;
      color: #ffffff;
      border: 0;
      border-radius: 8px;
      padding: 11px 24px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s ease, transform 0.1s ease;
      display: inline-block;
      width: 100%;
    }
    .btn:hover { background: #a855f7; }
    .btn:active { transform: scale(0.98); }
    .footer-note {
      margin-top: 18px;
      margin-bottom: 0;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    ${body}
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  // Support common parameter names (?token=, ?t=, ?hash=, ?key=, ?code=)
  const token =
    req.query.token ||
    req.query.t ||
    req.query.hash ||
    req.query.key ||
    req.query.code;
  const hwid = req.query.hwid;

  if (!token || typeof token !== 'string') {
    return res.status(400).send(
      page(
        'Invalid Link',
        '<p>No token was found in the URL.<br><br>' +
        '<strong>Did you set the Work.ink destination URL correctly?</strong><br>' +
        'In Work.ink, your destination URL must be:<br>' +
        '<code style="color:#c084fc;background:#0a0a0e;padding:4px 8px;border-radius:4px;display:inline-block;margin-top:8px">' +
        'https://helixkeys.vercel.app/api/key?token={TOKEN}' +
        '</code></p>'
      )
    );
  }

  // Prevent token replay using Upstash Redis
  const tokenKey = 'wi_token:' + token;
  if (redis) {
    const alreadyUsed = await redis.get(tokenKey);
    if (alreadyUsed) {
      return res.status(409).send(
        page(
          'Already Redeemed',
          '<p>This Work.ink link has already been redeemed.<br>Please complete a new link to generate another key.</p>'
        )
      );
    }
  }

  // Validate completion with Work.ink API
  const isValid = await validateWorkInkToken(token);
  if (!isValid) {
    return res.status(403).send(
      page(
        'Verification Failed',
        '<p>Work.ink did not verify completion of this offer.<br>Please complete the steps and try again.</p>'
      )
    );
  }

  // Record token as used for 24 hours to prevent reuse
  if (redis) {
    await redis.set(tokenKey, '1', { ex: 24 * 60 * 60 });
  }

  try {
    // Generate 12-hour HWID-locked key through PWF Auth Developer API
    const key = await createPwfKey(KEY_HOURS);

    // Optional: If HWID was passed in URL, link it in Redis
    if (redis && hwid && typeof hwid === 'string') {
      await redis.set('hwid:' + key, hwid, { ex: KEY_HOURS * 60 * 60 });
    }

    const body = `
      <div class="badge-row">
        <span class="badge">⏳ Valid for ${KEY_HOURS} Hours</span>
        <span class="badge">🔒 HWID Locked (1 PC)</span>
      </div>
      <p>Your access key has been successfully generated!</p>
      <div class="key-box" id="keyText">${key}</div>
      <button class="btn" id="copyBtn" onclick="copyKey()">Copy Key</button>
      <p class="footer-note">Paste this key into your application. It will automatically lock to your hardware ID on first use.</p>
      <script>
        function copyKey() {
          const text = document.getElementById('keyText').innerText;
          navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('copyBtn');
            btn.textContent = 'Copied to Clipboard!';
            btn.style.background = '#059669';
            setTimeout(() => {
              btn.textContent = 'Copy Key';
              btn.style.background = '#9333ea';
            }, 2500);
          });
        }
      </script>
    `;

    return res.status(200).send(page('Access Key Generated', body));
  } catch (error) {
    console.error('Key generation error:', error);
    return res.status(500).send(
      page(
        'Key Generation Failed',
        `<p>Unable to generate key through PWF Auth at this time.<br><span style="font-size:12px;color:#ef4444">${error.message}</span></p>`
      )
    );
  }
}
