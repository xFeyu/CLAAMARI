const WORKINK_OFFER = 'https://work.ink/2Cm2/xuro-key';

export default function handler(req, res) {
  const { hwid } = req.query;
  if (typeof hwid !== 'string' || hwid.length < 16) {
    return res.status(400).send('Missing or invalid hwid');
  }

  // 30-minute scope — long enough to finish the offer, short enough to be safe.
  res.setHeader('Set-Cookie',
    `hx_hwid=${encodeURIComponent(hwid)}; Path=/; Max-Age=1800; SameSite=Lax; Secure; HttpOnly`);
  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, WORKINK_OFFER);
}
