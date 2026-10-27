# Egipt 2026 – načrtovalec potovanja

A simple trip planner for the family trip to Giza, Cairo and Alexandria (29 Nov – 3 Dec 2026).
Mom chats with "Amira" in Slovenian or Russian, sends screenshots or uses the microphone,
and the day-by-day plan updates with photos (from Wikipedia) and Google Maps buttons.

## Netlify setup
1. Add new site → Import from GitHub → this repo. Build settings come from `netlify.toml`.
2. Site configuration → Environment variables:
   - `SITE_PASSWORD` – the password for the login screen (spaces/capitals are ignored)
   - `ANTHROPIC_API_KEY` – Claude API key
   - `SESSION_SECRET` – any long random text (optional, makes the login cookie stronger)
   - `ANTHROPIC_MODEL` – optional, default `claude-sonnet-5-5`
3. Deploy. The plan and chat are stored in Netlify Blobs (no setup needed) and shared by everyone who logs in.

## Structure
- `public/` – the page (Slovenian UI, phone-first)
- `netlify/functions/login.mjs` – password login, 120-day cookie
- `netlify/functions/state.mjs` – read plan + chat, reset
- `netlify/functions/chat.mjs` – talks to Claude (streaming), applies plan changes
- `lib/prompt.mjs` – Amira's instructions and trip facts (edit here if flights/hotels change)
- `lib/plan.mjs` – starting plan with flights and hotel moves
