export default async function handler(req, res) {
  const SELLER_KEY = process.env.KEYAUTH_SELLER_KEY;
  if (!SELLER_KEY) {
    res.status(500).send('Missing KEYAUTH_SELLER_KEY env var');
    return;
  }

  const url = 'https://keyauth.win/api/seller/'
            + '?sellerkey=' + SELLER_KEY
            + '&type=add&expiry=1&mask=****-****-****-****'
            + '&level=1&amount=1&format=text&character=2&note=lootlabs';

  try {
    const r = await fetch(url);
    const key = (await r.text()).trim();

    if (!key || key.length < 6 || key.toLowerCase().includes('error')) {
      res.status(500).send('KeyAuth returned: ' + key);
      return;
    }

    res.setHeader('Content-Type', 'text/html');
    res.send(
      '<!doctype html><html><body style="background:#111;color:#eee;font-family:sans-serif;text-align:center;padding:40px">'
      + '<h1 style="color:#e53138">Your Xuro Key (24h)</h1>'
      + '<input style="font-size:24px;padding:12px;width:80%;text-align:center" value="' + key + '" readonly onclick="this.select()">'
      + '<p>Paste into the cheat\'s Authenticate field.</p>'
      + '</body></html>'
    );
  } catch (e) {
    res.status(500).send('Generation failed: ' + e.message);
  }
}
