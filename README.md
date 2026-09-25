# Academic Reader

Read academic papers with a tutor in the margin. **Try it at [academic-reader.netlify.app](https://academic-reader.netlify.app).**

Academic Reader explains a paper while you read it: what each paragraph is doing in the argument, the terms of art, the people, and the works it cites. Select any passage to ask about it. It runs in your browser, on your phone or your computer, and you can install it like an app.

- **Notes in the margin.** A note on each paragraph: what it claims, how the argument is built, and the wording that matters.
- **Glossary, people and sources.** Terms of art explained in the paper's own field, who the people are, and what each cited work is and why it is cited.
- **Ask about anything.** Select words to have them unpacked, put in plain English, set in context, argued for and against, or turned into quiz questions.
- **Listen.** Read-aloud with your device's voices, sentence by sentence, skipping citations.
- **Remember.** Flashcards with spaced repetition (the scheduling Anki uses), made from the guide, from your questions or by hand, and exportable to Anki.
- **Open anything.** PDFs (including books, split into chapters), arXiv links, Markdown or pasted text.
- **Share.** Turn a paper and its guide into a single web page anyone can read, with no key and nothing to install.
- **Sync.** Keep your library the same on every device, through your own Dropbox or Google Drive.

## Try it without setting anything up

Open the app and tap **Try it on "Attention Is All You Need"**. Your browser downloads the 2017 paper that introduced the Transformer from arXiv, and it opens with a guide already built. Everything except asking new questions works straight away.

## What it costs

Reading, listening, flashcards and guides that come with a paper are free. Building a guide for a new paper, or asking questions, uses Claude through **your own Anthropic API key**, and you pay Anthropic directly for what you use. With the default model, a guide for an 8,000-word paper costs roughly half a dollar to a dollar, and a question costs a few cents. The app shows an estimate before it builds a guide.

To get a key:

1. Sign up at the [Anthropic Console](https://console.anthropic.com/). This is separate from a Claude.ai subscription, which does not include API use.
2. Add some credit under **Billing**.
3. Set a **monthly spend limit** under **Limits**. We recommend this: it caps what anyone could spend if the key ever leaked.
4. Create a key under **API keys** and paste it into Academic Reader when it asks.

## Privacy and security

There is no account and no server holding your data.

- **Your papers, guides, questions and flashcards** are kept in your browser's storage on your device.
- **Your Claude key** is encrypted (AES-256-GCM) before it is stored, either with a passphrase you choose (PBKDF2, 600,000 rounds) or with a key your browser holds and will not export. It is sent only to `api.anthropic.com`.
- **What leaves your device:** the paper's text and your questions go to Anthropic when you build a guide or ask something. A cited work's title or a person's name goes to OpenAlex or Wikipedia when you open its card. arXiv receives a request when you import from it. Your library goes to Dropbox or Google Drive only if you turn sync on, into a folder called Academic Reader that the app cannot see beyond.
- **The site itself** only serves the app. It pins the exact versions of its two libraries (subresource integrity) and sends a Content-Security-Policy that stops the page connecting anywhere except the services above.

While your key is unlocked, anyone using that browser can use it, and so could malicious code running in the page. The measures above close the usual routes; a spend limit on the key is the real safety net.

Clearing the site's data in your browser deletes everything in it. Turn on sync, or use **Settings → Download a backup** now and then.

## Sync

**Settings → Sync across devices**, then connect the same account on each device:

- **Dropbox** uses the folder *Apps › Academic Reader*. The app has access to that folder only.
- **Google Drive** uses a folder called *Academic Reader*, and the app can see only the files it created. Google gives browser apps access for an hour at a time, so the app renews it with a quick redirect when you open it, and now and then asks you to tap Reconnect.

Local copies are primary. Changes upload after a few seconds, and the app checks for changes when it opens, when you return to it, and every 90 seconds. Edits made on two devices at once are merged: both sides' questions are kept, and the newer guide wins.

## Sharing a paper as a web page

**⋮ → Export this text → Web page for readers…** saves one `.html` file containing the text and its guide. Upload it to any web host and link to it (from a blog post, for example). Readers get the text, notes, glossary, people, sources, reading settings and read-aloud, with nothing to set up and no Claude key. A small "Made with Academic Reader" link lets them open the paper in the app, where they can ask their own questions.

## Running your own copy

The app is a static page plus one optional serverless function, and it deploys to Netlify's free tier.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/techurbanist/academic-reader)

Environment variables (Netlify → Project configuration → Environment variables), all optional:

| Variable | What it does |
|---|---|
| `SYNC_TOKEN` | Turns on sync through your own site (Netlify Blobs). Use a long random key, and enter the same key on each device under Settings → Sync. `SYNC_TOKEN_SHA256` (the key's SHA-256 in hex) works instead, so the key itself never goes into Netlify. With neither, the sync function refuses every request. |
| `PUBLIC_URL` | Where shared web pages point readers to. Defaults to the public app. |
| `DROPBOX_APP_KEY` | Your Dropbox app's key, to offer Dropbox sync (see below). |
| `GOOGLE_CLIENT_ID` | Your Google OAuth client ID, to offer Google Drive sync (see below). |

### Setting up Dropbox sync

1. At [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps), choose **Create app → Scoped access → App folder**, and name it *Academic Reader*.
2. **Settings → OAuth 2 → Redirect URIs:** add your site's address with a trailing slash, for example `https://academic-reader.netlify.app/`. Leave **Allow public clients (Implicit Grant & PKCE)** on.
3. **Permissions:** tick `files.content.read` and `files.content.write`, then **Submit**.
4. Copy the **App key** into `DROPBOX_APP_KEY` and redeploy. There is no secret to copy: the app uses PKCE.

A new Dropbox app allows 500 users. Before it passes 50, apply for production status in the App Console.

### Setting up Google Drive sync

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Google Drive API**.
2. **Google Auth Platform → Branding:** fill in the app name and contact details. **Audience:** External. **Data access:** add the scope `https://www.googleapis.com/auth/drive.file`, which is non-sensitive, so it needs no verification review.
3. **Clients → Create client → Web application.** Under **Authorised redirect URIs** add your site's address with a trailing slash, for example `https://academic-reader.netlify.app/`. Under **Authorised JavaScript origins** add the address without the slash.
4. Copy the **Client ID** into `GOOGLE_CLIENT_ID` and redeploy.
5. While the app's publishing status is **Testing**, only the test users you list can connect (up to 100). Publish it to open it to everyone.

## Developing

```
public/index.html          the whole app: HTML, CSS and one script, with no build step or framework
public/sw.js               offline cache
public/samples/            the sample paper's recipe and guide (the text itself comes from arXiv)
netlify/functions/sync.mts optional sync through your own site
scripts/headers.mjs        writes the Content-Security-Policy, with the hash of the app's script
build.sh                   stamps the build time and site settings into the app, and writes the headers
```

Serve `public/` with any static server to run it locally. `AGENTS.md` describes the architecture and the testing approach.

## Licence

Academic Reader is released under the [MIT licence](LICENSE): you may use, change and share it, including commercially, as long as you keep the copyright notice.

One exception: the tables reproduced in `public/samples/attention.json` come from "Attention Is All You Need" (Vaswani et al., 2017) and remain under Google's notice on that paper, which permits reproducing its tables and figures, with attribution, for journalistic or scholarly works. The paper's text is not included; the app downloads it from arXiv.
