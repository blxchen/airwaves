# Airwaves security boundary

## What the repository can protect

- No password, YouTube API key, signing key, or privileged credential is committed.
- Backstage password input is not written to storage.
- Imported Studio files are limited to 8 MB and normalized to bounded track, measure, beat, and chord-note counts.
- Imported and saved text is escaped before it is inserted into generated UI.
- The optional duration Worker keeps its YouTube API key in a Cloudflare secret and returns only public video metadata.

## What GitHub Pages cannot protect

GitHub Pages sends every HTML, JavaScript, asset, and verifier to every visitor. A browser-side password screen can discourage casual access, but a visitor can bypass it with developer tools or fetch protected page files directly. Hashing or obfuscating the password does not turn a static page into an authorization system.

Do not store unreleased recordings, private contact data, API keys, or other secrets anywhere in this repository or in browser local storage.

## Production requirement

For real Backstage access control, put the entire Backstage origin behind an identity-aware reverse proxy such as Cloudflare Access, or move `backstage.html`, `next-set.html`, `studio.html`, and their JavaScript to a server that validates an HttpOnly authenticated session before returning any protected files. Deny framing, add a restrictive Content Security Policy, rate-limit API routes, and keep all service credentials in server-side secrets.

The local password gate may remain as a second convenience lock, but it must not be treated as the primary security boundary.
