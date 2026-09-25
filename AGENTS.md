# AGENTS.md

Orientation for an agent picking up this project without its history. Read this first, then `README.md`.

## What this is

**Academic Reader** (formerly Gloss) is a reading app for academic papers, built as a PWA and used on phones and desktops. It was built for its owner, Brendan, a senior software engineer who reads philosophy of mind and science papers outside his field, and is now public: anyone can use it with their own Claude key, and nothing is stored on a server. Internal identifiers still say `gloss` (localStorage keys `gloss.*`, the IndexedDB database `gloss`, the Blobs store `gloss`, the schemas `gloss-pack/1`, `gloss-bundle/1`, `gloss-backup/1`). Keep them: renaming would strand existing libraries and files.

Core features:

- **Reader.** Markdown rendering, themes, fonts, layout controls.
- **Guide.** Per-paragraph notes on the argumentative move being made, a glossary, people, sources and named arguments. Claude generates it and the notes are anchored to the text.
- **Ask.** Select any passage for an explanation, with several "lenses" and follow-up questions.
- **Read-aloud.** Uses the browser's speech engine.
- **Flashcards.** Anki-style spaced repetition.
- **PDF import.** Imports from the page layout, and can split a book into chapters.
- **Sync.** Across devices, through the reader's own Dropbox or Google Drive, or a server of their own.
- **Web page for readers.** Exports a paper and its guide as one read-only HTML page.

Live at `https://academic-reader.initialloop.com` (also `academic-reader.netlify.app`; Netlify project `academic-reader`, site id `cb861cc9-8fd6-4316-be31-be754e886450`), built from `main` on GitHub. It has no `SYNC_TOKEN`, so its sync function refuses everything; Brendan syncs through Dropbox like any other user. (His earlier private site, `gloss-reader-ai07`, has been retired.) The app is published under the **Initial Loop** brand; contact `support@initialloop.com`. The privacy policy is `public/privacy.html`, served at `/privacy` and linked from the Dropbox and Google app registrations: keep it accurate when data handling changes.

Repo (public): `git@github.com:techurbanist/academic-reader.git`.

## Working agreements

- **Never change Netlify access settings** (password or team-login protection). The owner sets them deliberately. An earlier agent overrode them twice by mistake.
- **Never put secrets in the repo, logs or chat.** The repo is public. Each user's Anthropic key lives only in their browser, encrypted. Dropbox app keys and Google client IDs are public identifiers, not secrets.
- **User-facing copy about data and cost is plain technical writing:** state what happens, with no reassurance or salesmanship. The owner found persuasive wording read as untrustworthy.
- **Nothing about a user goes to our servers.** The app talks directly from the browser to Anthropic, OpenAlex, Wikipedia, arXiv, Dropbox and Google. Keep it that way: no analytics, no proxy. A new outside service also needs adding to the CSP in `scripts/headers.mjs`.
- **Test before shipping.** Every change so far has been verified in headless Chromium (Playwright) against a mocked Anthropic API, and against a local server running the real sync function (see Testing). Several real bugs were caught this way. Keep doing it.
- **Be honest about limits.** When something is untested against the real API or real voices, say so. The owner prefers direct pushback to agreement.
- **Deploying.** If the repo is linked to Netlify, GitHub is the source of truth: deliver commits, not side-channel deploys. Otherwise deploy with the Netlify MCP `deploy-site` flow from the repo root, which runs `build.sh`.
- **Bump the service-worker cache name** (`gloss-shell-vN` in `public/sw.js`) on every deploy that changes `index.html`, and bump `APP_VERSION` in `index.html`.
- **Library upgrades need new hashes.** The CDN scripts carry `integrity` attributes, and the pdf.js worker is checked against `PDFWORKER_SHA512`. Take hashes from `https://api.cdnjs.com/libraries/<name>/<version>?fields=sri`.

## Layout

```
public/index.html        the whole client, about 3,000 lines: HTML, CSS, one script, no build step, no framework
public/sw.js             service worker: page network-first, CDN libs and fonts stale-while-revalidate, /api/* never cached
public/samples/attention.json   the sample's recipe and guide (see Sample paper)
public/manifest.webmanifest, icon-192.png, icon-512.png
netlify/functions/sync.mts   optional sync API on Netlify Blobs, for a copy someone runs themselves
scripts/headers.mjs      writes public/_headers: CSP with the sha256 of the inline script, nosniff, referrer policy
build.sh                 stamps __BUILD_TIME__, __PUBLIC_URL__, __DROPBOX_APP_KEY__, __GOOGLE_CLIENT_ID__ from env,
                         writes public/version.json, then runs scripts/headers.mjs (so the CSP hash matches the stamped page)
netlify.toml             publish = public, command = bash build.sh, no-cache headers, Deploy-button env prompts
```

`CONFIG` near the top of the script holds the stamped settings. A local unstamped copy treats them as empty: Dropbox and Drive then show "Not set up on this site".

Libraries come from cdnjs as UMD script tags, pinned: marked 12.0.2, DOMPurify 3.1.6, pdf.js 3.11.174 (loaded on demand). Fonts come from Google Fonts. Keep versions pinned.

## Client architecture (public/index.html)

Plain DOM. The helper `h(tag, attrs, ...kids)` builds elements, `$` and `$$` are query helpers, and `md()` renders sanitised Markdown. The script is organised in `/* ==== section ==== */` blocks, roughly in this order:

- **Error log (`Log`).** A ring buffer of 300 entries in `localStorage['gloss.log']`, redacting keys. Viewer: `openLog()`. Uncaught errors and API failures are logged automatically. Use `Log.add(level, where, msg, detail)` for anything that can fail.
- **Storage (`Store`, `DB`, `Decks`).** IndexedDB database `gloss`, version 2, with stores `docs` and `decks`. Preferences live in `localStorage['gloss.prefs']` (object `P`, defaults in `DEF_PREFS`). Other localStorage keys: `gloss.vault` (encrypted API key), `gloss.last` (last open document), `gloss.deckSel` (study selection).
- **Vault.** Two modes, chosen in `openKeySetup`. Passphrase: PBKDF2-SHA256 with 600k iterations, then AES-GCM-256; unlocks for `P.unlockMins` (default 60). Device: a non-extractable AES-GCM key kept in its own IndexedDB database `gloss-keys`; never prompts. Get the key with `await Vault.get()`; with no key it opens the Connect Claude dialog.
- **Welcome and setup (`welcome`, `openKeySetup`, `checkClaudeKey`, `openPrivacy`, `backupAll`, `restoreBackup`, `guideEstimate`).** The empty state is the welcome page (also in ⋮ → Welcome and help). Connect Claude walks through the Anthropic Console, checks the key with `GET /v1/models`, and asks for an optional "about you" (`P.about`, empty by default; prompts fall back to `DEFAULT_READER`). `guideEstimate` prices a guide from `PRICES` (update them when prices change) and is shown before every build. Backups (`gloss-backup/1`) hold docs, decks and prefs, never the key; restoring keeps whichever copy is newer.
- **Claude API (`claudeStream`).** Streaming fetch straight to api.anthropic.com, using the `anthropic-dangerous-direct-browser-access` header. It parses SSE and records the last response in `LAST_DEBUG` (shown in Settings). `claudeJSON` and `GUIDE_SCHEMA` are dead code left from an earlier design and can be removed.
- **Markdown to blocks (`renderMd`).** Pre-processes `[^n]` footnotes (marked has no footnote support), renders, then marks each block element with `data-bid`. The **block id is `'b' + fnv(lowercased text)`**, with a suffix for duplicates. Stable ids are the backbone of the app: annotations, notes, reading position, flashcard sources and version diffs all key off `bid`. Blocks after a References/Bibliography heading are flagged `bib`.
- **Rendering overlays (`renderDoc`).** Wraps inline marks (terms, people, citations, key-wording signals, your questions) using `findQuote` (quote matching that normalises whitespace and quote marks) and `wrapRange` (splits text nodes). It adds a margin "rail" button per paragraph with a note, then calls `appendEndNav()` for previous/next.
- **Citation marks (`refSpan`, `anchorBid`).** A reference anchor's quote from the guide job is often a whole clause ("Antony (2006) examines what follows…") or a group citation shared by several works. `refSpan` narrows the mark to this work's own citation: it finds the work's year in the quote, then splits any enclosing parenthesis at `;` and `, <year>` and keeps the piece(s) holding it, or walks back over an author phrase for narrative citations ("Han, Chalmers and Izmailov (2026, preprint)"). With no year it marks the author's name; with neither, nothing. `anchorBid` recovers anchors whose paragraph number was one off (usually pointing at the heading above). One-word capitalised aliases of longer terms ("Data" for Commander Data) match case-sensitively in `buildEntityIndex`.
- **Cards and sheet.** A bottom sheet on mobile, a side panel at 1100px and wider. It keeps a card stack (`openCard`, `drawCard`) for term, person, reference, paragraph, argument, ask and guide cards. Entity names inside card prose are auto-linked (`linkEntitiesIn`).
- **Ask (`askCard`, `LENSES`, `tutorSystem`, `contextFor`).** Conversations are saved as `pack.notes`, anchored by `bid` and a quote.
- **Guide generation (the job queue).** Details below.
- **New versions (`loadNewVersion`).** Diffs locally by block id plus bigram similarity. Only changed or new paragraphs are re-annotated.
- **PDF (`importPdf`, `extractLayout`, `blocksToMarkdown`, `labelPart`, `cleanPart`, `runConversions`).** Details below.
- **Read-aloud (`TTS`).** Details below.
- **Sync (`Sync`, `serverBackend`, `fileBackend`, `dropboxStore`, `driveStore`, `Auth`).** Details below.
- **arXiv (`arxivId`, `fetchArxivPdf`, `arxivDialog`).** arXiv serves PDFs with `Access-Control-Allow-Origin: *`, so the browser downloads them directly and hands them to `importPdf`.
- **Flashcards (`SRS`, `Cards`, `Screen`, `openDecks`, `openDeck`, `startStudy`, `editCard`, `cardsWithClaude`, `cardFromSelection`).** Details below.
- **Library (`libraryRecords`, `inferGroups`, `openLibrary`).** 5 records per page, most recent first. Multi-section PDF imports are one expandable group record.
- **Web page for readers (`exportStatic`, `staticHtml`, `STATIC`).** Details below.
- **Menu (`openMore`)** holds every action. Tapping the title opens `openInfo()` ("About this text": stats, field, rename).

### Data model

```
doc   { id, title, group?:{id,title,order}, versions:[{md, at, name}], pack, created, updated,
        pos, posBid, dirty, editSeq, sync:{rev, vers, packHash, sentPack}, convert?, deleted? }
pack  { schema:'gloss-pack/1', meta:{title, authors, summary, field}, outline:[{bid,heading,gist}],
        arguments:[{id,name,form,bid,gloss,premises:[{label,text,bid}],conclusion,pressurePoints}],
        people:[{id,name,aliases,role,inThisPaper,importance,profile?}],
        references:[{id,key,full,authors,year,title,doi,kind,use,anchors:[{bid,q}],live?}],
        moves:{ [bid]: {kind,label,what,how,signals:[{q,note}],critique} },
        terms:[{id,term,aliases,kind,short,background,inThisPaper,related,deep?}],
        notes:[{id,bid,q,thread:[{role,content,label}],createdAt}],
        jobs:[{id,layer,label,ids,status,error,known?,cache?}], stub? }
deck  { id (= doc id), title, cards:[card], mod, dirty, etag, deleted? }
card  { id, front, back (Markdown), bid, src, origin, created, mod, state:'new'|'learn'|'review'|'relearn',
        step, due, ivl (days), ease, reps, lapses, first, last, hist:[{t,r,s,ivl}], suspended?, deleted? }
```

A pack with `stub:true` exists only to hold notes before any guide was built; use `hasGuide()` or `hasGuideDoc(d)` rather than checking whether `pack` is truthy.

### Guide generation (job queue)

Each guide is a list of small, independent jobs stored in `pack.jobs`, so they can be resumed after the app closes (⋮ → Resume). `planJobs()` creates:

- one overview job, one arguments job and one people job for the whole text;
- then, for each chunk of about 1,700 words (`chunkBlocks`), a moves job, a terms job and a references job.

Every request (`jobRequest`) sends **the same prefix**: the system prompt, then the whole numbered text (`¶n` lines) marked `cache_control: {type:'ephemeral', ttl:'1h'}`. Only the final short task text differs (`TASKS[layer]` plus `SHAPES[layer]`, the JSON shape described in plain text). Lessons that shaped this design, so don't undo them:

- **No structured-output schema for guide jobs.** One combined JSON schema hit "The compiled grammar is too large". Per-layer schemas would each invalidate the prompt cache, because changing `output_config.format` invalidates it. So guide jobs ask for JSON in plain text and parse it with `parseLoose`, retrying once on bad JSON. Small schemas are fine elsewhere: PDF `labelPart` uses one.
- **No forced tool use.** Newer models (Opus 5.5, Fable/Mythos 5.1) reject `tool_choice` that forces a tool, and the docs discourage it.
- **Sonnet 5 thinks by default,** and thinking counts against `max_tokens`. `P.maxTokens` defaults to 32000, and effort is set via `output_config.effort` (`P.guideEffort` default `medium`, `P.askEffort` default `high`). Haiku doesn't take `effort`.
- **The first job runs alone** so it writes the cache; parallel requests only hit the cache once that response has begun. The rest then run three at a time (`pool`), with retry and backoff on 429, 5xx and network errors.
- **The field is detected automatically.** The overview job reports it (`meta.field`), later prompts use it, and `fieldGroup()` maps it to phil / cs / bio / psych / general for look-up links. The user can correct it in About this text.

Models: `P.mainModel` = `claude-sonnet-5`, `P.fastModel` = `claude-haiku-4-5-20251001`. Both are editable in Settings.

### PDF import

- **Picking what to import.** pdf.js reads the outline (`outlineRanges`). The dialog lists sections with front matter unticked, and offers each as its own text or all as one. For books, the References section can be appended to every chapter so citation cards work. Multi-section imports get a shared `group`.
- **Standard mode (default): `extractLayout`.** Rebuilds the text from item positions, sizes and font names, with no model rewriting. Handled cases, each hard-won:
  - running heads and page numbers (short edge lines that recur or carry numbers; chapter numbers are protected by size);
  - rotated margin notices;
  - two-column pages (gutter detection on wide rows);
  - different margins on left and right pages (measured per page);
  - first-line-indent paragraphs versus spaced block paragraphs;
  - hanging-indent reference lists;
  - raised footnote markers, and footnotes at the page foot, kept as asides so they don't split paragraphs;
  - hyphenation at line ends (soft hyphens removed; real compounds kept by checking mid-line usage);
  - zero-width break characters after dashes;
  - italics, identified from font names;
  - small caps that the PDF encodes as odd mixed case ("tHis").
  Then `labelPart` sends Haiku short excerpts of about 70 blocks and gets back only labels (heading levels, removals, merges, quotes) under a small JSON schema. `blocksToMarkdown` assembles the result.
- **Thorough mode: `cleanPart`.** Haiku retypes three-page chunks with read-only neighbouring context. Keep it for scans, heavy tables and two-column journal pages that come out jumbled.
- **No Claude mode:** layout only, with `guessLabels`.
- **Conversions are resumable.** A document under conversion has `convert:{mode, blocks|pages, parts:[...]}`, saves each part as it finishes, shows a Resume panel, and is excluded from sync until assembled.
- **Test PDF:** the owner's copy of Kammerer, *House of Mirrors* (OUP, 357 pages). Chapter 1 (pages 15–51) gave exact wording against `pdftotext`, correct headings and all footnotes.

### Read-aloud (`TTS`)

- **Sentence by sentence,** using `Intl.Segmenter`, because long utterances get cut off in some browsers. Short labels such as "P1." are folded into the next sentence.
- **Pause is stop-and-remember,** because `speechSynthesis.pause()` is unreliable on Android.
- **What gets read.** Reference lists, footnote markers and (optionally) bracketed citations are skipped, and abbreviations are expanded (`TTS.spoken`).
- **Highlighting and position.** The current sentence is highlighted with the CSS Custom Highlight API, and `posBid` is updated as it reads.
- **Staying awake.** A Screen Wake Lock is held while reading, because Android stops speech when the screen locks.
- **No lock-screen or headphone controls.** Web Speech doesn't create a media session. A neural TTS service (the owner has GCP) would fix both limits and is a possible future step.

### Sync

- **Local first.** IndexedDB is primary. Changes push after a short debounce, and the app pulls on start, on becoming visible, on reconnect, and every 90 seconds.
- **One merge layer, three backends.** `Sync` holds the merge logic; `Sync.B` is a backend with `listHeads`, `putHead(id, head, baseRev)` (returns `{ok}` or `{conflict: remoteHead}`), `getVer`/`putVer`, `getPack`/`putPack`, `listDecks`/`getDeck`/`putDeck`. `P.syncProvider` is `''`, `'dropbox'`, `'gdrive'` or `'server'` (devices that had a sync key migrate to `'server'`). Changing provider calls `resetSyncState()`, so everything merges into the new place.
- **Merging.** Text versions are unioned, notes are unioned by id, the newer guide wins, and the push retries. Decks merge card by card, keeping the greater `mod`. Deletions are tombstones (`deleted:true`).
- **Dropbox and Google Drive (`fileBackend`)** store flat files in one folder: `head.{id}.json`, `ver.{id}.{hash}.md`, `pack.{id}.{hash}.json`, `deck.{id}.json`. A head write is compare-and-swap on the file's revision. Dropbox does it atomically (`mode: update` with `strict_conflict`). Drive has no conditional write, so `driveStore.write` checks `version` just before writing, leaving a small race window. Heads are cached by revision, so a pull reads only changed heads.
- **Dropbox auth:** OAuth code flow with PKCE, no secret, `token_access_type=offline`; the refresh token lives in `localStorage['gloss.sync.dropbox']`. App-folder access only.
- **Google auth:** the implicit flow (`response_type=token`, scope `drive.file`) by redirect, with no refresh token. An access token lasts an hour, so `Sync.init` renews it at start-up with a `prompt=none` redirect (once per session), and otherwise shows Reconnect. The folder id is cached in `gloss.sync.gdrive.folder`.
- **Redirects** return to `location.origin + location.pathname`. That exact URL must be registered with Dropbox and Google. `finishSignIn()` runs first in `boot`, checks `state` against sessionStorage, and cleans the address bar.
- **This site's server (`serverBackend` plus `netlify/functions/sync.mts`).** Server keys: `head/{id}`, `ver/{id}/{hash}`, `pack/{id}/{hash}`, `deck/{id}`. Head writes need `x-base-rev`, and a mismatch returns 409 with the current head. Auth: header `x-sync-token`, compared against `SYNC_TOKEN` or `SYNC_TOKEN_SHA256`. With neither, it fails closed (503), which is what the public site does. The Settings option appears only when `Sync.probe()` finds a live function (200 or 401). The Netlify MCP env-var tool reports success but reads back nothing, so confirm env vars in the Netlify UI.

### Flashcards

- **Scheduler (`SRS`).** Anki's classic SM-2 defaults: learning steps 1m and 10m, graduating interval 1d, easy interval 4d, starting ease 250%, Hard ×1.2 and −15% ease, Easy ×1.3 and +15% ease, lapse −20% ease with a 10-minute relearn step and a 1-day interval, minimum ease 130%, intervals forced to Hard < Good < Easy, ±5% fuzz from 3 days, day rollover at 4am local. Verified against Anki's documented button intervals. FSRS is a possible later upgrade and should keep the `hist` history.
- **Sessions (`startStudy`)** can combine any selection of decks. Order: learning cards when due, then reviews with new cards mixed in, then learn-ahead within 20 minutes. There's a per-deck daily cap on new cards (`P.newPerDay`, default 20), plus Undo and keyboard shortcuts.
- **Card sources:** the guide (`Cards.fromGuide`, free); Claude per section (`cardsWithClaude`, using the same cached prefix, so it's cheap if a guide was built in the last hour); a passage selection from the Ask panel (`cardFromSelection`); or written by hand. Export for Anki: `Cards.anki()` produces tab-separated text with Anki's header directives.

### Web page for readers (static edition)

⋮ → Export this text → Web page for readers… writes one self-contained `.html` file for sharing (for example from a Substack post). `staticHtml` fetches the app's own `index.html`, removes the manifest link, inlines the icon, adds `<title>`, description and Open Graph tags, and inserts `<script id="gloss-static" type="application/json">` holding `{schema:'gloss-static/1', intro, doc}` (latest version only, no `jobs`, saved questions only if ticked; `<` escaped as `\u003c`).

When that block is present, `STATIC` is set and the same code runs read-only: `DB` and `Decks` are in-memory stubs (the reading place goes to `localStorage['gloss.static.<id>']`, and no IndexedDB is opened), `claudeStream` throws, `Sync.init` returns, and no service worker is registered. The library button, Ask, deepen buttons, flashcards, settings and end-of-text navigation are hidden. The ⋮ menu becomes `staticMenu`. A dismissible "How to read this" box (`staticIntro`) carries the owner's note and an AI-authorship notice. Paragraph cards offer "Copy a link to it" (`#<bid>` deep links). Reference cards still look up OpenAlex, and person cards still look up Wikipedia; neither needs a key. When changing a feature that needs a key or the server, keep it out of static mode.

A dismissible "Made with Academic Reader" pill (`staticBadge`, `appCard`) links to `CONFIG.publicUrl` (the public app by default, so pages exported from a self-hosted copy still point there). "Open this paper in Academic Reader" (`openInApp`) opens `publicUrl + '#receive'`. The app (`receiveFromPage`) posts `ar-ready` to `window.opener` until the page answers with `{type:'ar-bundle', bundle}`, accepts it only from `window.opener`, and asks before adding it. A paper it already has, by text hash, just opens.

### Sample paper

"Attention Is All You Need" is under arXiv's non-exclusive licence, so we can't redistribute its text. `openSample` downloads the PDF from arXiv in the reader's browser, runs `extractLayout`, then `applyRecipe(blocks, recipe)` from `public/samples/attention.json`. The recipe is keyed to extractLayout's block numbers:
- `drop`, `join`, `move`, `split`, `heading`, `caption` and `notes` set the structure;
- `fix` holds short find/replace pairs;
- `text` holds the equations and the four tables (Google's notice on the paper permits reproducing tables with attribution);
- `insert` adds the missing "1 Introduction" heading and an attribution line;
- `global` fixes the flattened subscripts (`dk` → `dₖ`, `dmodel` → `d_model`).

The same file holds the guide (`pack`), anchored to block ids of the resulting text. **If extractLayout changes, re-run the sample and check that the note count still matches**; a mismatch is logged. If arXiv is unreachable, it falls back to the short built-in sample (`openShortSample`).

The shipped guide was produced by running the app's own 18 guide jobs, with their exact prompts, through Claude, then replaying the answers through the real pipeline against a mocked API. To regenerate it, build the guide in the app with a real key and copy `pack` (minus `jobs`) into the file.

## Testing

No test runner is committed. The pattern that has worked:

1. **Serve the app and the real sync function locally.** Load `netlify/functions/sync.mts` under Node 22 with `--experimental-strip-types`, replacing the two Netlify imports with stubs. Serve `public/` from the same small HTTP server, and back the function with an in-memory store implementing `get`, `set`, `setJSON`, `delete`, `list` (with etags), `getWithMetadata` and `getMetadata`. Use a test token.
2. **Drive it with Playwright (Chromium, headless),** routing `https://api.anthropic.com/**` to a mock that returns SSE. Detect the task from the prompt text (for example `Fill "moves"` or `Blocks to label:`) and return plausible JSON. Inject 429s and a hard 400 to exercise retry and resume.
3. **Use two browser contexts as two devices** to test sync and merging.
4. **Mock `speechSynthesis`** for read-aloud tests (headless Chromium has no voices).
5. **Syntax check:** extract the `<script>` and run `node --check`.

6. **Two-device sync against mocks.** Tests route Dropbox (`/oauth2/token`, `files/list_folder`, `download`, `upload` with conflicts, `delete_v2`) and Drive (folder query, multipart create, media PATCH, `version`) to in-memory stores shared by two contexts. They route the OAuth pages to 302s back to the app, and run the real `sync.mts` behind the local server. Stamp a copy of `public/` (as build.sh does) to set `CONFIG`, and serve pages with the CSP from `scripts/headers.mjs`, so violations show up in tests. Block service workers in test contexts, because a service worker's fetches bypass Playwright's routes.

Things verified this way: Dropbox, Drive and server sync between two devices (edits, concurrent questions, flashcards, deletions, token refresh, Drive reconnect), onboarding (key check, both vault modes, cost estimate, backup and restore), the page-to-app hand-off, the arXiv sample, citation narrowing against a real bundle, the static export (no API or sync requests, no IndexedDB, position and deep links), guide queue resume, cache prefix identity across jobs, version diffs, PDF chapter import against `pdftotext` word counts, two-device sync including conflicts and deletions, the SRS intervals, library grouping and pagination, and end-of-text navigation.

## Known limitations and ideas

- Deleting a saved question on one device while another has unsynced edits to the same text can bring the question back after the merge.
- In Standard PDF mode, long URLs in references can keep a stray space, and a real hyphenated compound broken at a line end can lose its hyphen. Two-column detection is only lightly tested.
- Reference abstracts come from OpenAlex, which rations unauthenticated requests; an optional key goes in Settings.
- Dropbox and Drive sync were tested against mocks built from their documentation, never the real services. Try them with a real account before relying on them.
- Google Drive's check-then-write leaves a small race window; two devices saving the same head at the same instant could lose one write (the next edit re-merges).
- The cost estimate uses an average output per job; real costs vary with the text and the model's thinking.
- Possible next steps: FSRS scheduling, a neural TTS voice with media-session controls, removing the dead `claudeJSON` and `GUIDE_SCHEMA`, and a committed test harness based on the pattern above.

## Style of the app's own text

UI copy is plain, direct, second person, in British/Australian spelling. Prompts to Claude describe the reader through `P.about` (editable in Settings) and the paper's field. They never assume philosophy.
