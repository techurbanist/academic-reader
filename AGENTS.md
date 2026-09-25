# AGENTS.md

Orientation for an agent picking up this project without its history. Read this first, then `README.md`.

## What this is

**Gloss** is a single-user reading app for academic papers, built as a PWA and used mainly on an Android phone, also on desktop. The owner, Brendan, is a senior software engineer who reads philosophy of mind and science papers outside his field. He uses Gloss to learn a field's ideas, people, jargon and argument conventions while he reads.

Core features:

- **Reader.** Markdown rendering, themes, fonts, layout controls.
- **Guide.** Per-paragraph notes on the argumentative move being made, a glossary, people, sources and named arguments. Claude generates it and the notes are anchored to the text.
- **Ask.** Select any passage for an explanation, with several "lenses" and follow-up questions.
- **Read-aloud.** Uses the browser's speech engine.
- **Flashcards.** Anki-style spaced repetition.
- **PDF import.** Imports from the page layout, and can split a book into chapters.
- **Sync.** Across devices, through Netlify Blobs.

Live at `https://gloss-reader-ai07.netlify.app` (Netlify project `gloss-reader-ai07`, site id `7b228d40-8263-4fb2-91ab-76331a0e10e8`). Repo: `git@github.com:techurbanist/academic-reader.git`.

## Working agreements

- **Never change Netlify access settings** (password or team-login protection). The owner sets them deliberately. An earlier agent overrode them twice by mistake.
- **Never put secrets in the repo, logs or chat.** The Anthropic API key lives only in each browser, encrypted. The sync key is known only to the owner's devices; the code holds only its SHA-256 fingerprint.
- **Test before shipping.** Every change so far has been verified in headless Chromium (Playwright) against a mocked Anthropic API, and against a local server running the real sync function (see Testing). Several real bugs were caught this way. Keep doing it.
- **Be honest about limits.** When something is untested against the real API or real voices, say so. The owner prefers direct pushback to agreement.
- **Deploying.** If the repo is linked to Netlify, GitHub is the source of truth: deliver commits, not side-channel deploys. Otherwise deploy with the Netlify MCP `deploy-site` flow from the repo root, which runs `build.sh`.
- **Bump the service-worker cache name** (`gloss-shell-vN` in `public/sw.js`) on every deploy that changes `index.html`, and bump `APP_VERSION` in `index.html`.

## Layout

```
public/index.html        the whole client, about 2,400 lines: HTML, CSS, one script, no build step, no framework
public/sw.js             service worker: page network-first, CDN libs and fonts stale-while-revalidate, /api/* never cached
public/manifest.webmanifest, icon-192.png, icon-512.png
netlify/functions/sync.mts   sync API on Netlify Blobs (about 130 lines)
build.sh                 stamps UTC deploy time into index.html (__BUILD_TIME__) and writes public/version.json
netlify.toml             publish = public, command = bash build.sh, no-cache headers for sw.js and index.html
```

Libraries come from cdnjs as UMD script tags, pinned: marked 12.0.2, DOMPurify 3.1.6, pdf.js 3.11.174 (loaded on demand). Fonts come from Google Fonts. Keep versions pinned.

## Client architecture (public/index.html)

Plain DOM. The helper `h(tag, attrs, ...kids)` builds elements, `$` and `$$` are query helpers, and `md()` renders sanitised Markdown. The script is organised in `/* ==== section ==== */` blocks, roughly in this order:

- **Error log (`Log`).** A ring buffer of 300 entries in `localStorage['gloss.log']`, redacting keys. Viewer: `openLog()`. Uncaught errors and API failures are logged automatically. Use `Log.add(level, where, msg, detail)` for anything that can fail.
- **Storage (`Store`, `DB`, `Decks`).** IndexedDB database `gloss`, version 2, with stores `docs` and `decks`. Preferences live in `localStorage['gloss.prefs']` (object `P`, defaults in `DEF_PREFS`). Other localStorage keys: `gloss.vault` (encrypted API key), `gloss.last` (last open document), `gloss.deckSel` (study selection).
- **Vault.** PBKDF2-SHA256 with 600k iterations, then AES-GCM-256. Unlocks for `P.unlockMins` (default 60). Get the key with `await Vault.get()`, which prompts the user if needed.
- **Claude API (`claudeStream`).** Streaming fetch straight to api.anthropic.com, using the `anthropic-dangerous-direct-browser-access` header. It parses SSE and records the last response in `LAST_DEBUG` (shown in Settings). `claudeJSON` and `GUIDE_SCHEMA` are dead code left from an earlier design and can be removed.
- **Markdown to blocks (`renderMd`).** Pre-processes `[^n]` footnotes (marked has no footnote support), renders, then marks each block element with `data-bid`. The **block id is `'b' + fnv(lowercased text)`**, with a suffix for duplicates. Stable ids are the backbone of the app: annotations, notes, reading position, flashcard sources and version diffs all key off `bid`. Blocks after a References/Bibliography heading are flagged `bib`.
- **Rendering overlays (`renderDoc`).** Wraps inline marks (terms, people, citations, key-wording signals, your questions) using `findQuote` (quote matching that normalises whitespace and quote marks) and `wrapRange` (splits text nodes). It adds a margin "rail" button per paragraph with a note, then calls `appendEndNav()` for previous/next.
- **Cards and sheet.** A bottom sheet on mobile, a side panel at 1100px and wider. It keeps a card stack (`openCard`, `drawCard`) for term, person, reference, paragraph, argument, ask and guide cards. Entity names inside card prose are auto-linked (`linkEntitiesIn`).
- **Ask (`askCard`, `LENSES`, `tutorSystem`, `contextFor`).** Conversations are saved as `pack.notes`, anchored by `bid` and a quote.
- **Guide generation (the job queue).** Details below.
- **New versions (`loadNewVersion`).** Diffs locally by block id plus bigram similarity. Only changed or new paragraphs are re-annotated.
- **PDF (`importPdf`, `extractLayout`, `blocksToMarkdown`, `labelPart`, `cleanPart`, `runConversions`).** Details below.
- **Read-aloud (`TTS`).** Details below.
- **Sync (`Sync`).** Details below.
- **Flashcards (`SRS`, `Cards`, `Screen`, `openDecks`, `openDeck`, `startStudy`, `editCard`, `cardsWithClaude`, `cardFromSelection`).** Details below.
- **Library (`libraryRecords`, `inferGroups`, `openLibrary`).** 5 records per page, most recent first. Multi-section PDF imports are one expandable group record.
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

### Sync (`Sync` plus `netlify/functions/sync.mts`)

- **Local first.** IndexedDB is primary. Changes push after a short debounce, and the app pulls on start, on becoming visible, on reconnect, and every 90 seconds.
- **Server keys:** `head/{id}` (small JSON: rev, title, group, version hashes, packHash, posBid, deleted), `ver/{id}/{hash}` (immutable text), `pack/{id}/{hash}` (immutable guide; the superseded one is deleted), `deck/{id}` (deck JSON; the list endpoint returns etags).
- **Head writes need `x-base-rev`.** A mismatch returns 409 with the current head, and the client merges: text versions are unioned, notes are unioned by id, the newer guide wins, and it retries.
- **Decks merge card by card,** keeping the greater `mod`. Deletions are tombstones (`deleted:true`) so they propagate.
- **Auth.** Every request needs header `x-sync-token`. The function compares its SHA-256 against `KEY_SHA256` in `sync.mts`, or against the `SYNC_TOKEN` env var if one is set. With neither, it fails closed (503). The Netlify MCP env-var tool reported success but stored nothing, which is why the fingerprint is in code; set env vars in the Netlify UI instead. Devices enter the key in Settings → Sync key.
- **Private mode.** If the owner enables site-wide login protection, the manifest needs `crossorigin="use-credentials"` (already present), and sync then also depends on the Netlify session cookie.

### Flashcards

- **Scheduler (`SRS`).** Anki's classic SM-2 defaults: learning steps 1m and 10m, graduating interval 1d, easy interval 4d, starting ease 250%, Hard ×1.2 and −15% ease, Easy ×1.3 and +15% ease, lapse −20% ease with a 10-minute relearn step and a 1-day interval, minimum ease 130%, intervals forced to Hard < Good < Easy, ±5% fuzz from 3 days, day rollover at 4am local. Verified against Anki's documented button intervals. FSRS is a possible later upgrade and should keep the `hist` history.
- **Sessions (`startStudy`)** can combine any selection of decks. Order: learning cards when due, then reviews with new cards mixed in, then learn-ahead within 20 minutes. There's a per-deck daily cap on new cards (`P.newPerDay`, default 20), plus Undo and keyboard shortcuts.
- **Card sources:** the guide (`Cards.fromGuide`, free); Claude per section (`cardsWithClaude`, using the same cached prefix, so it's cheap if a guide was built in the last hour); a passage selection from the Ask panel (`cardFromSelection`); or written by hand. Export for Anki: `Cards.anki()` produces tab-separated text with Anki's header directives.

## Testing

No test runner is committed. The pattern that has worked:

1. **Serve the app and the real sync function locally.** Load `netlify/functions/sync.mts` under Node 22 with `--experimental-strip-types`, replacing the two Netlify imports with stubs. Serve `public/` from the same small HTTP server, and back the function with an in-memory store implementing `get`, `set`, `setJSON`, `delete`, `list` (with etags), `getWithMetadata` and `getMetadata`. Use a test token.
2. **Drive it with Playwright (Chromium, headless),** routing `https://api.anthropic.com/**` to a mock that returns SSE. Detect the task from the prompt text (for example `Fill "moves"` or `Blocks to label:`) and return plausible JSON. Inject 429s and a hard 400 to exercise retry and resume.
3. **Use two browser contexts as two devices** to test sync and merging.
4. **Mock `speechSynthesis`** for read-aloud tests (headless Chromium has no voices).
5. **Syntax check:** extract the `<script>` and run `node --check`.

Things verified this way: guide queue resume, cache prefix identity across jobs, version diffs, PDF chapter import against `pdftotext` word counts, two-device sync including conflicts and deletions, the SRS intervals, library grouping and pagination, and end-of-text navigation.

## Known limitations and ideas

- Deleting a saved question on one device while another has unsynced edits to the same text can bring the question back after the merge.
- In Standard PDF mode, long URLs in references can keep a stray space, and a real hyphenated compound broken at a line end can lose its hyphen. Two-column detection is only lightly tested.
- Reference abstracts come from OpenAlex, which rations unauthenticated requests; an optional key goes in Settings.
- Possible next steps: FSRS scheduling, a neural TTS voice with media-session controls, removing the dead `claudeJSON` and `GUIDE_SCHEMA`, and a committed test harness based on the pattern above.

## Style of the app's own text

UI copy is plain, direct, second person, in British/Australian spelling. Prompts to Claude describe the reader through `P.about` (editable in Settings) and the paper's field. They never assume philosophy.
