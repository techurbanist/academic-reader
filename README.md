# Gloss

A reader for academic papers with a tutor in the margin. Installable as a PWA on Android and desktop.

- **Guides**: paragraph-by-paragraph notes on what each passage does, a glossary, people, sources and named arguments, built by Claude from one cached copy of the text in small, resumable jobs.
- **Ask**: select any passage for an explanation (plain English, the move being made, context, for and against, quiz).
- **Read aloud** with the browser's speech engine, sentence by sentence.
- **Flashcards** with Anki-style spaced repetition (SM-2), one deck per text, combinable for study, exportable to Anki.
- **PDF import** from the page layout (paragraphs, italics, footnotes, headings) with Claude only labelling structure, or a full rewrite for difficult PDFs. Books can be split into chapters.
- **Sync** across devices through Netlify Blobs.

## Layout

```
public/                  the app (static)
  index.html             everything client-side
  sw.js                  offline cache
  manifest.webmanifest, icons
netlify/functions/
  sync.mts               sync API: /api/sync/* backed by Netlify Blobs
build.sh                 stamps the deploy time into the app and version.json
netlify.toml             publish dir and build command
```

## Deploy

Netlify builds with `bash build.sh` and publishes `public/`. The sync function is bundled automatically.

To deploy on every push, link this repo to the Netlify site (Project configuration → Build & deploy → Link repository).

## Sync key

The sync API only accepts requests carrying the sync key (header `x-sync-token`). The function checks it against a SHA-256 fingerprint in `sync.mts`. The fingerprint cannot be turned back into the key, but for a public repo it is tidier to set a `SYNC_TOKEN` environment variable in Netlify instead, which overrides the fingerprint. With neither, sync refuses all requests.

Each device enters the key once in Settings → Sync key.

## Keys and privacy

The Anthropic API key is entered on each device, encrypted with a password (PBKDF2 + AES-GCM) and stored only in that browser. It is sent only to api.anthropic.com.
