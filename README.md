# PWF Auth & Work.ink 12-Hour HWID-Locked Key System

A serverless backend built for Vercel that verifies Work.ink completions and automatically generates a **12-hour, HWID-locked license key** via the **PWF Auth** Developer API.

---

## 🚀 How It Works

1. **User completes Work.ink task:**
   - Work.ink redirects the user to your Vercel endpoint:  
     `https://your-vercel-domain.vercel.app/api/key?token={TOKEN}`
2. **Token Verification:**
   - The backend checks Upstash Redis to ensure the Work.ink token has not been reused (anti-replay).
   - Validates the token with Work.ink's API.
3. **PWF Key Generation:**
   - Calls PWF Auth (`POST https://pwfauth.com/api/v1/keys`) to mint a **12-hour key** with `max_devices: 1`.
4. **Display:**
   - Presents a dark-mode landing page with the generated key and a 1-click copy button.
5. **HWID Locking:**
   - The key is locked to `max_devices: 1`. Upon the first login/verification, PWF Auth automatically binds the key to the machine's hardware ID.

---

## ⚙️ Environment Variables (Vercel)

Set these in your **Vercel Project Settings → Environment Variables**:

| Variable | Description |
|---|---|
| `PWF_API_KEY` | Developer API key from [PWF Auth](https://pwfauth.com) (ensure "make keys" permission is enabled) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL (prevents token replay) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token |

---

## 🔗 Configuring Work.ink

In your Work.ink link configuration, set the **Target / Destination URL** to:

```text
https://your-vercel-app.vercel.app/api/key?token={TOKEN}
```

> Work.ink will automatically replace `{TOKEN}` with the completion token upon redirect.

---

## 📡 Endpoints

### 1. `GET /api/key`
- **Query Params:**
  - `token` *(required)*: The Work.ink completion token.
  - `hwid` *(optional)*: The user's machine hardware ID if passed from your client loader.
- **Response:** HTML page showing the 12-hour key with copy button.

### 2. `POST /api/validate`
- **Request Body (JSON):**
  ```json
  {
    "key": "YOUR-PWF-KEY",
    "hwid": "USER-HWID-OPTIONAL"
  }
  ```
- **Response:**
  ```json
  {
    "valid": true,
    "key": "...",
    "hours_left": 12,
    "expires_at": "...",
    "status": "active"
  }
  ```
