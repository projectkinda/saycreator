# Engine contract (first draft)

The UI talks to **`src/engine/index.ts` only**. The real engine replaces that module and keeps these
signatures. Types live in `src/engine/types.ts` and are re-exported from `src/engine`.

Rules for every function:
- Async, returns a Promise. Mock delays are 200 ms to 1.5 s.
- Failures that the user can recover from throw `EngineError` (`code`, `message`, `retryable`).
  `message` is shown to the user, so write it in plain words.
- `startRender` and `applyPatch` do **not** throw for expected failures; they return them (see below).
- Ids are opaque strings.

## Account and Home

| Function | Input | Output | Notes |
|---|---|---|---|
| `getSession()` | none | `Session` `{ userName, brands: Brand[], credits: {used,total} }` | Credits shown as `total - used` left. |
| `getHome(brandId)` | brand id | `HomeData` `{ todo, week, recent, trends, ideas }` | `todo` is derived from project state (needs a style, needs a thumbnail approved, failed render). `trends[].image` is **optional**: omit it when the source has no image, the UI then shows no image area. |
| `listProjects(brandId)` | brand id | `Project[]` | Newest edited first. The Videos screen filters and sorts this list in the browser. `Project.resolution` decides portrait vs landscape thumbnail. |

## Styles library

| Function | Input | Output | Notes |
|---|---|---|---|
| `listStyles(brandId)` | brand id | `VideoStyle[]` | `{id,name,description,origin:'suggested'|'mine',fromReference,poster}`. "My styles" = `origin:'mine'`; "From references" = `fromReference:true`. Description of a reference style should say what was copied and what was approximated. |
| `createStyleFromReference(brandId, file, onProgress)` | file `{name,size}`, `onProgress(0..1)` | `VideoStyle` | Same `UPLOAD_FAILED` behaviour as `uploadVideo`. |

Not in the contract yet: edit/delete a style, preview a style on the user's footage, pass the chosen style into a project (the UI links `/videos/new?style=<id>`).

## Projects

| Function | Input | Output | Notes |
|---|---|---|---|
| `getProject(projectId)` | project id | `Project` | Throws `NOT_FOUND`. While rendering: `status:'rendering'` and `renderProgress` 0..1, so the page can be left and revisited. |
| `createProject({brandId, title?, source})` | `source`: `'upload' \| 'record'` | `Project` | Starts at step 1. |
| `uploadVideo(projectId, file, onProgress)` | `file: {name,size}` (a `File` fits), `onProgress(0..1)` | `{ project, warnings: string[] }` | Throws `EngineError('UPLOAD_FAILED')` on failure; footage stays safe, UI offers retry. A low-resolution file returns a warning string (not an error). |
| `analyse(projectId)` | project id | `MediaCard` `{ projectId, durationSec, language, transcript[], shots[] }` | Moves project to step 2 (Choose a style). `shots[].quality` is `'soft'` for low-res footage. |
| `suggestStyles(projectId)` | project id | `StyleSuggestion[]` (3 to 5) | Each has a `preset` of `punchy \| calm \| cinematic`. |

## Edit plan

`Plan` is a placeholder: `{ projectId, revision, data }`. The UI only reads `revision`; `data` is opaque.

| Function | Input | Output | Notes |
|---|---|---|---|
| `getPlan(projectId)` | project id | `Plan` | Current revision. |
| `getDirection(projectId)` | project id | `DirectionState {direction, notes, checks, plan}` | Current direction, director's notes (4 per preset), checks and plan. Follows undo/redo. A `Check` may carry `fixPatch` for its fix button. |
| `setDirection(projectId, {preset, intensity})` | `intensity` 0 to 100 | `DirectionState` | Creates a new revision. The UI sends intensity changes only after the slider has been still for 0.6 s. |
| `getTimeline(projectId)` | project id | `Timeline {tracks[], previewCaption}` | Five tracks (video, camera, captions, assets, audio) with blocks in percent of length. Read-only in the UI. |
| `interpretRequest(projectId, text)` | the user's words | `{reading, previewNote, patch}` | Powers "Reading this as...". Applies nothing. |
| `applyPatch(projectId, patch)` | `Patch {label, ops: {path, value}[]}` | `{ok:true, plan}` or `{ok:false, reasons: string[]}` | Rejection is a normal result, not an exception. `reasons` are shown to the user as-is. |
| `undo(projectId)` / `redo(projectId)` | project id | `Plan` | No-op at the ends of history. |
| `getHistory(projectId)` | project id | `History {entries (newest first, with label and current), canUndo, canRedo}` | Redo entries stay in the list until a new change replaces them. |

## Render

| Function | Input | Output | Notes |
|---|---|---|---|
| `startRender(projectId, onProgress)` | `onProgress(job: RenderJob)` | `Promise<RenderJob>` final job | `RenderJob {id, projectId, status: queued\|rendering\|done\|failed, progress 0..1, error?}`. A failed render **resolves** with `status:'failed'` and a plain-words `error`. Calling again is the retry. |

## Thumbnails, text, calendar

| Function | Input | Output | Notes |
|---|---|---|---|
| `listThumbnails(projectId)` | project id | `ThumbnailOption[]` | Each has `phoneCheck {ok, note}` and `selected`. |
| `selectThumbnail(projectId, thumbnailId)` | ids | `ThumbnailOption[]` | Editing text/layout on a thumbnail is not in the contract yet; the UI links to Images for from-scratch work. |
| `generateText(projectId, kind)` | `kind`: clips, linkedin, x-thread, carousel, captions, article | `TextAsset {…, status: ready or needs-review}` | Idempotent per kind. Throws `TEXT_FAILED` (user is not charged). Carousels come back `needs-review`. |
| `getMakeMore(projectId)` | project id | `MakeMoreItem[]` | One per kind: `status` not-made, found, ready or needs-review; optional `badge` ("2 found") and `credits` cost. |
| `getTextAsset(projectId, kind)` | | `TextAsset or null` | |
| `approveText(projectId, kind)` | | `TextAsset` | User confirmed the flagged item; status becomes `ready`. |
| `listMadeFromVideo(projectId)` | project id | `MadeItem[]` | Edited video, chosen thumbnail, and every text asset, each with `scheduled`. |
| `addToCalendar(projectId, itemId)` | | `CalendarEntry` | Puts something made from a video on the calendar. The mock picks the first free day this week; the real engine may pick better. |
| `planCalendar(brandId, weekStart?)` | brand id, optional `YYYY-MM-DD` | `PlanEntry[]` | The short agenda on Home: five days from `weekStart` (default today), one `empty` row for a day with nothing. `status`: ready, needs-thumbnail, empty, suggested, render-retry, posted. `PlanEntry.id` is the calendar entry id, so Home's "Add" calls `acceptSuggestion`. See Calendar below for the full model. |

## Help

Guides and release notes are content, not engine logic. They are behind the engine so they can later come from a CMS or the product team instead of being bundled in the app.

| Function | Input | Output | Notes |
|---|---|---|---|
| `listGuides()` | none | `{topics: string[], guides: Guide[]}` | `Guide {id, title, summary, topic, steps[], link{label, to}}`. `link.to` is an in-app path. The UI filters by topic and searches title, summary and steps in the browser. |
| `listReleaseNotes()` | none | `ReleaseNote[]` newest first | `{id, date (YYYY-MM-DD), title, items[]}`. The UI marks anything from the last 14 days as "New". |
| `getSupportInfo()` | none | `{replyTime, topics[{id,label}]}` | `replyTime` is plain words ("within 1 working day") and is quoted back to the user, so only promise what support can keep. |
| `sendSupportMessage({topic, message, replyTo})` | topic: broken, billing, question, idea | `{reference, replyTime}` | Throws `INVALID_INPUT` (bad email, message under 10 characters) or `SUPPORT_FAILED`. Both messages say the message was not sent; the UI keeps what the user typed. |

Not in the contract yet: attachments or screenshots, attaching the current video or page automatically, a list of the user's earlier requests, and live chat.

## Settings and billing

Money and deletion are the risky parts: the UI always shows the exact charge or consequence first and only then runs the call. Failures must say plainly that the user was not charged or that nothing changed.

| Function | Input | Output | Notes |
|---|---|---|---|
| `getBilling()` | none | `Billing {plan, plans[], packs[], credits{used,total}, renewsOn, paymentMethod}` | `BillingPlan {id, name, priceMonthly, creditsPerMonth, blurb}`, `CreditPack {id, credits, price}`. `paymentMethod` is plain words like "Visa ending 4242", never a full number. `credits` here and in `getSession` must agree; the UI re-reads the session after a change so the sidebar meter updates. |
| `changePlan(planId)` | plan id | `Billing` | Throws `PAYMENT_FAILED` (card declined) or `INVALID_INPUT` (new plan includes fewer credits than used this month). Both messages are shown as is. |
| `buyCredits(packId)` | pack id | `Billing` | Charged to the saved method. Throws `PAYMENT_FAILED`. |
| `listCosts()` | none | `CostItem[]` `{id, action, credits, note?}` | What each action costs, shown as a table and on buttons. `credits: 0` shows as "Free". Whether credits are actually spent by actions is the engine's job: the mock does not spend them. |
| `listAccounts(brandId)` | brand id | `ConnectedAccount[]` `{platform, name, connected}` | Same connection state as Analytics. Connect and Disconnect reuse `connectAccount` and `disconnectAccount`. |
| `getExportDefaults(brandId)` / `updateExportDefaults(brandId, patch)` | patch of `aspect` (9:16, 1:1, 16:9), `resolution` (720p, 1080p, 4K), `burnCaptions` | `ExportDefaults` | Should be the starting values of every export. |
| `getAccountStatus()` | none | `{userName, deletionScheduledFor?}` | |
| `requestAccountDeletion(confirm)` | the typed word | `AccountStatus` | `confirm` must equal `DELETE`, otherwise `INVALID_INPUT`. Starts a 30-day countdown; nothing is removed until it ends. |
| `cancelAccountDeletion()` | none | `AccountStatus` | One click to undo while the countdown runs. |
| `requestDataExport()` | none | `{message}` | The link arrives by email; the message is shown as is. |

Not in the contract yet: invoices and receipts, changing the payment method (the UI does not collect card details at all), team members, cancelling a paid plan outright, tax, and what happens to published posts' analytics after deletion.

## Analytics

| Function | Input | Output | Notes |
|---|---|---|---|
| `getAnalytics(brandId)` | brand id | `AnalyticsData {isExample, connected{instagram,youtube}, stats[], daily[{date,views}] (28 days, oldest first), peak, insights[], suggestions[], posts[]}` | `isExample` must be `true` whenever the numbers are an illustration rather than the user's own (no account connected): the UI then shows an "Example data" tag and the connect prompt. If connected but nothing is published yet, return empty `posts`; the UI shows a teaching empty state. `insights` are early patterns and the UI labels them "Early patterns, not proof", so never phrase them as certain. Each `AnalyticsPost` carries how we cut it (`edit[]`) because that is the comparison only we can make. `AnalyticsSuggestion.target` is `calendar` or `new-project`. |
| `connectAccount(brandId, platform)` | `instagram` or `youtube` | `AnalyticsData` | Throws `CONNECT_FAILED` with a plain message. A real implementation will redirect to the platform's sign-in and come back; the UI would then call `getAnalytics`. |
| `disconnectAccount(brandId, platform)` | | `AnalyticsData` | |

Not in the contract yet: a date range, per-platform filtering, how a post is matched to our edit, and when numbers refresh (the UI says "about once a day").

## Branding

Brand kit (how things look):

| Function | Input | Output | Notes |
|---|---|---|---|
| `getBrandKit(brandId)` | brand id | `BrandKit {brandId, colors{primary,text,background,highlight}, fonts{headline,body}, logo{name,poster}, handle}` | Colours are `#RRGGBB`. The handle always starts with `@`. |
| `listFonts()` | none | `string[]` | Font names the user can pick. The UI only previews a font if the browser has it. |
| `updateBrandKit(brandId, {colors?, fonts?, handle?})` | any subset | `{kit, warnings: string[]}` | An invalid colour, unknown font or bad handle throws `INVALID_INPUT` with a plain message and saves nothing. `warnings` do not block saving: the mock warns when text on background is under 4.5:1 or primary on background is under 3:1. |
| `replaceLogo(brandId, file, onProgress)` | file `{name,size}` | `BrandKit` | Same `UPLOAD_FAILED` behaviour; the old logo stays on failure. |

Writing voice (how words sound):

| Function | Input | Output | Notes |
|---|---|---|---|
| `getVoice(brandId)` | brand id | `VoiceProfile {samples, tone[], sentenceLength 1..5, wordsUse[], wordsAvoid[], emoji: None\|Occasional\|Often, example{generic, yours}}` | `samples` is how many past posts we learned from. The UI shows "a starting guess" under 2. |
| `getVoiceOptions()` | none | `{tones[], emoji[]}` | The choices in the Edit form. |
| `addVoiceSample(brandId, text)` | a pasted post | `VoiceProfile` | Text under 120 characters throws `INVALID_INPUT` ("a bit short..."). A real engine should say what it learned. |
| `updateVoice(brandId, patch)` | any of tone, sentenceLength, wordsUse, wordsAvoid, emoji | `VoiceProfile` | An empty `tone` throws `INVALID_INPUT`. |

Not in the contract yet: several logo variants (dark/light), fonts uploaded by the user, one voice per channel, regenerating `example` after an edit, removing a learned post. Brand and voice are per brand, so the brand switcher should change both.

## Calendar

We never post for the user. "Ready" means ready for them to copy and post. Dates are local `YYYY-MM-DD`, times `HH:MM`.

| Function | Input | Output | Notes |
|---|---|---|---|
| `getCalendar(brandId, from, to)` | inclusive date range | `{entries, unscheduled, goal}` | `CalendarEntry {id, date, time, channel (LinkedIn, Instagram, X, YouTube Shorts), title, status: ready\|needs-thumbnail\|render-retry\|suggestion\|posted, projectId?, text?, image?, imageLabel?}`. `unscheduled` is made-but-not-placed items (`UnscheduledItem {id, label, channel, projectId?, text?, image?}`). The week view asks for 7 days, the month view for the whole grid. |
| `planForGoal(brandId, goal)` | goal in the user's words | `CalendarEntry[]` added | Fills empty days in the next two weeks with `suggestion` entries. Empty array means nothing to add. |
| `moveEntry(brandId, entryId, date, time?)` | | `CalendarEntry` | Throws `INVALID_DATE` for a past day (message shown as is). Used by drag, drop and the Move button. |
| `scheduleItem(brandId, itemId, date)` | an unscheduled item | `CalendarEntry` | Item leaves `unscheduled`. |
| `acceptSuggestion(brandId, entryId)` | | `CalendarEntry` | Suggestion becomes `ready`. A real engine may need to make the post first and could take a while. |
| `removeEntry(brandId, entryId)` | | void | Only offered for suggestions. |
| `markPosted(brandId, entryId)` | | `CalendarEntry` | The user posted it themselves and tells us. |

Not in the contract yet: setting a time, a different channel, "Download image", posting directly (depends on platform access that is not confirmed), month-level planning, and saving the goal separately from planning.

## Images

| Function | Input | Output | Notes |
|---|---|---|---|
| `listImages(brandId)` | brand id | `ImageItem[]` newest first | `{id, kind: thumbnail\|carousel\|quote\|image, title, ratio: 16:9\|4:5\|1:1\|9:16, caption, poster, textTone, status: ready\|needs-review\|draft, note?{ok,text}, source, projectId?, createdAt}`. `note` is the phone-size or safe-zone check in plain words. `source` is shown as is ("From “…”", "Made on its own"). Images made inside a video (thumbnails, carousels, quote cards) should appear here with `projectId` set. |
| `uploadImage(brandId, file, onProgress)` | file `{name,size}`, `onProgress(0..1)` | `ImageItem` (draft) | Same `UPLOAD_FAILED` behaviour as `uploadVideo`. |
| `createImage(brandId, input)` | `{start:'template', kind}`, `{start:'frame', projectId}` or `{start:'ai', prompt}` | `ImageItem` (draft) | AI costs `AI_IMAGE_CREDITS` (exported constant, 20 in the mock; the UI shows it on the button). Throws `IMAGE_FAILED` and does not charge. |

Not in the contract yet: opening a draft to edit text, crop or layout; deleting or downloading an image; how a template picks brand colours.

## Assets

| Function | Input | Output | Notes |
|---|---|---|---|
| `listAssets(brandId)` | brand id | `AssetItem[]` newest first | `{id, name, kind: product\|logo\|screenshot\|music, status: processing\|ready, note{tone: ok\|warn\|progress\|plain, text}, poster, durationSec?, usedIn, usedEverywhere?, createdAt}`. `note` is the one thing worth saying: "Cut out", "Transparent", "Low resolution", "No transparent background", "Labelling…". The UI polls this every 2 s while any asset is `processing`, so the engine should flip `status` and `note` when labelling finishes. |
| `uploadAssets(brandId, files, onProgress)` | `files: {name,size}[]` (a `File[]` fits) | `{added: AssetItem[], rejected: {name, reason}[]}` | Unsupported files are returned in `rejected` (reason in plain words) while the rest still go through. A dropped connection throws `UPLOAD_FAILED` and adds nothing. Kind is guessed from the file type and name; the real engine should classify from the content. `ASSET_TYPES` is the accepted-types sentence. |

Not in the contract yet: rename, delete, replace, "cut out the background" again, where an asset is used (list of videos), and audio preview.

## Carousels and quote cards: the real image engine (Images > Make a carousel)

This part does **not** go through `src/engine/index.ts`. The page `/images/carousel` (code in `src/carousel/`, loaded on its own so the image engine is not part of every page) uses the real image engine in `src/image-engine/` directly, in the browser. No key, no network call from this code. The mock `createImage({start: 'template', kind: 'carousel' | 'quote'})` is **kept behind a flag**: set `VITE_MOCK_CAROUSEL=1` when starting the app, or `localStorage.setItem('creator.mockCarousel', '1')`, and the Images screen shows "Make a carousel (mock)" which opens the old template draft. The mock `generateText(projectId, 'carousel')` inside a video project is **not** replaced yet.

| Piece | What it is |
|---|---|
| Script (input) | JSON: `{ title, brand: {handle}, slides: [...] }`. A carousel has exactly 7 slides, quote cards 1 to 7 slides of type `quote`. Slide types: cover, content, step, stat, checklist, beforeafter, quote, closing; fields per type are in `src/carousel/script.ts` (`FIELDS`). Every slide may carry `element_tags` (2 to 4 lower-case words). `validateScriptText(text, format)` returns plain-language errors with the place in the JSON, and warnings (long copy, a highlight that is not in the headline, no tags). A pasted chat answer with a ```json fence or text around it is cleaned first. |
| Prompt | `scriptPrompt(topic, format)`: topic, the JSON format with an example of every slide type, and the rules (7 slides, short copy, one idea per slide, tags from the planner vocabulary, no invented figures). Copied to the clipboard; pasted into any Claude chat by the person. |
| Writer | Replaced in Step 9 by the providers below (`WriteProvider` in `src/carousel/writer.ts`); "Write it for me" is now the Generate button. |
| Project | `Doc { version, format, style, topic, script, choices }`, saved in `localStorage` key `creator.carousel.project.v1` together with the undo and redo history (80 steps). An unsent pasted text is kept under `creator.carousel.paste.v1`. Anything saved that no longer validates is dropped instead of crashing. |
| Changes | Every change is a `DocPatch { label, coalesce?, ops: [{path, value}] }` with an inverse, so Undo and Redo cover everything: edit a field, edit tags, change layout, swap an element, shuffle elements, regenerate a slide from the plan, change style, change format, load a script. A change that would make the script invalid is refused with reasons. Typing in one field within 1.5 s is one undo step. |
| Styles | `loadStyles()`: every folder under `src/image-engine/styles/` with a valid `style.json`. A new folder appears in the picker with a small preview by itself. |
| Drawing | `composeDoc(doc)` makes the plans (shippable library only, never test assets); `renderer.render(slide, margin)` draws and checks one slide (8 phone-size checks) and caches by plan, so editing one slide redraws only that slide. |
| Export | One PNG per slide (`<deck>-NN.png`, 1080 x 1350 or 1080 x 1080) or a zip of those files, written in the browser (`src/carousel/export.ts`). |

### One-shot writer (Step 9)

The main flow is now: paste text, optional chips (format, slide count 3 to 10, tone, style or "Pick for me", handle), **Generate**. The writer is chosen by the page from what the server offers; the browser holds no key and only calls this app's own routes (`src/carousel/writer.ts`).

| Route | Provider | Notes |
|---|---|---|
| `GET /__carousel/status`, `POST /__carousel/write` | `dev-cli`: runs the Claude Code command line (`claude -p`, no tools, no saved session, empty temp folder) on this computer | Mounted only by the Vite dev server (`vite.config.ts`), so it does not exist in a production build. The command is found from `CLAUDE_BIN`, the PATH, or the copy inside the Claude desktop app. Uses the signed-in Claude account on that computer. |
| `GET /api/carousel/status`, `POST /api/carousel/write` | `api`: Anthropic Messages API | Reads `ANTHROPIC_API_KEY` from the server's environment (or an untracked `.env`); off when it is missing. Optional `CAROUSEL_MODEL` (default claude-sonnet-5-5). The repository has no production server yet: `server/carousel-writer.ts` exports `carouselHandler('api')`, a Connect-style handler, to mount in one. |

Request `{ prompt }`, answer `{ text, ms }` or `{ error, kind }` with a plain-words message (`unavailable`, `failed`, `timeout`, `cancelled`). The page prefers `api` over `dev-cli`, shows which one is active in a small dev-only label, and disables Generate (pointing at the Advanced fold) when neither is available.

The prompt (`src/carousel/writerPrompt.ts`) carries the person's text, the script format, the rules (only facts from the text, no invented statistics, a marked placeholder when a number is missing, one idea per slide, short copy limits, a strong cover and a closing call to action, 2 to 4 `element_tags` from the library vocabulary, fewer slides plus a "note" when the text is thin) and, for "Pick for me", the list of styles. The answer is checked with the same validator as a pasted script; if it fails, the writer is asked once more with the problems; if that fails too, plain errors are shown and the text is kept. Text over 12,000 characters is refused with a message, never cut. Cancelling while writing aborts the request (the server stops the program); cancelling while drawing undoes the generation.

`.env.example` lists the variables. `npm run check:secrets` (part of `npm run build`) fails if a key-shaped string, the name of the key variable or the `x-api-key` header appears in `src/`, `public/`, `dist/` or `index.html`, if a key appears in `server/` or `.env.example`, or if an env file is tracked by git.

Not in the contract yet: saving a finished carousel to the Images list or to a video project, more than one project at a time, brand colours and fonts from the Branding screen, server-side rendering, sharing for review, and a production server for the API writer.

### Photos (Step 11, engine only: the Images screen does not use them yet)

Additions the image engine accepts; nothing in the mock engine changes.

| Piece | What it is |
|---|---|
| Script | A slide may carry `photo` (the name of a photo the person added) and `photo_hint` (at most 90 characters, what picture would suit it). Both optional. A slide with no photo for its slot draws a clean placeholder and a note on the slide card, never an error. |
| Image layer | `treatments` (a list of at most 12 steps: grayscale, duotone, halftone, grain, levels, blur, motionBlur, tint, vignette, fade, wash), `object` (shadow `contact` or `drop`, `reflection`, `glow`; needs `fit: "contain"`), `shadow`, `synthetic` (true for a stand-in picture, so it is labelled wherever shown), and `mask.shape` may also be pill, arch, diamond, flower, blob or starburst. |
| New layers | `field` (a blurred colour field: base colour, blobs, blur, grain, seed) and `glass` (a card that blurs what is behind it; not rotated). |
| Plan meta | `photoSlots`: for each photo slot of a slide, whether it is filled, the hint, and whether the picture is a stand-in. |
| In the browser | `analysePhoto(url)` reads a photo into a 12 by 15 grid (brightness, detail) used to place words; no network call, no model. `checkWithRepair` draws and checks a slide and, if the words still fail contrast on a full photo, strengthens the overlay, then adds a whole-photo overlay, then plates. |

Not in the contract yet: uploading photos, choosing a photo per slide, treatments or frames in the editor, and cut-outs inside a carousel.

## Test switches (mock only)

`mockControls.failNext('upload' | 'render' | 'text' | 'image' | 'connect' | 'payment' | 'support')` makes the next call fail. In dev it is also on
`window.__engine`. Files named with `fail` fail to upload; names with `lowres`, `720` or `480` give the
low-resolution warning. The real engine does not need these.

## Known gaps (to settle with the engine developer)

- Home buttons "Add", "Save", "Make this", "Start" are local or link-only in the UI; no engine calls yet.
- No brand kit, writing voice, assets, images, analytics or settings functions yet. They are added when those screens are built.
- Credits are shown but never spent by the mock; the real engine decides when a cost is charged and how "not enough credits" is reported.
- Export, Share for review and clip rendering have no engine calls yet.
