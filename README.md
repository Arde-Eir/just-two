# just us two — E2E Encrypted Private Feed

A private, end-to-end encrypted feed. Supabase cannot read any content.

## How encryption works

Alice posts:
1. ECDH P-256 keypair generated in browser (once)
2. Private key stored in IndexedDB, AES-encrypted with local password
3. Public key published to Supabase
4. Browser fetches partner public key → ECDH → shared AES-256-GCM key
5. Text + media encrypted in browser before upload
6. Only ciphertext reaches Supabase

Bob reads:
1. Same ECDH derivation → same shared key
2. Fetches ciphertext, decrypts in browser

## File Structure

src/lib/crypto.js        - ECDH keygen, AES-256-GCM encrypt/decrypt (Web Crypto API)
src/lib/keystore.js      - IndexedDB: encrypted private key storage (never leaves device)
src/lib/sessionKeys.js   - In-memory CryptoKey objects (cleared on page close)
src/lib/api.js           - All Supabase calls (posts, keys, storage, auth)
src/lib/validation.js    - Input + file validation
src/lib/constants.js     - File limits, bucket name, rate limits
src/lib/utils.js         - timeAgo, formatBytes, helpers
src/lib/supabase.js      - Supabase client singleton

src/hooks/useAuth.js     - Session state
src/hooks/useE2E.js      - Full E2E lifecycle: setup → unlock → derive shared key
src/hooks/usePosts.js    - Fetch, decrypt, cache posts

src/components/UI.jsx              - Button, Input, Avatar, ErrorBanner, Spinner
src/components/Header.jsx          - Sticky header
src/components/KeySetupScreen.jsx  - Key generation / unlock / waiting screens
src/components/ComposeBox.jsx      - Encrypts before posting
src/components/PostCard.jsx        - Decrypts for display

src/pages/AuthPage.jsx  - Sign in / sign up
src/pages/FeedPage.jsx  - Feed layout

supabase-setup.sql  - Full DB schema, RLS, storage (run once)
vercel.json         - CSP, HSTS, X-Frame-Options headers
.env.example        - Copy to .env.local, never commit .env.local

## Setup

1. Create Supabase project at supabase.com
2. Run supabase-setup.sql in SQL Editor
3. Copy .env.example to .env.local, fill in URL + anon key
4. npm install && npm run dev
5. Both users sign up, confirm email, set local encryption password
6. Disable sign-ups in Supabase Auth settings after both accounts exist

## Two passwords

Login password    - Supabase auth (sent to server, normal)
Encryption password - Protects private key in IndexedDB (NEVER sent anywhere)

If encryption password is lost, private key cannot be recovered. Write it down.