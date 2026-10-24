# Status

Last updated: after Help (all planned screens are built).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
```

## Stack (and why)

- React + TypeScript + Vite, plain CSS with variables, `react-router-dom` for routing.
- State: React local state plus one small context (session, current brand). No state library; nothing needs one yet.
- Brand colour lives only in `--accent` in `src/styles/tokens.css`.

## What exists

- App shell: left menu (brand switcher, New project, 7 menu items, credits meter, Settings & billing, Help), skip link, top bar with menu button on phones (drawer, closes on route change, Escape or backdrop).
- Routes for every menu item, and every one is now a real screen: `/`, `/videos`, `/videos/new`, `/videos/:id`, `/images`, `/assets`, `/calendar`, `/branding`, `/analytics`, `/settings`, `/help`. Only the not-found page is still the plain placeholder.
- Home screen (from `reference/Main.dc.html`): Start a new video (Upload or Record only), Your to-do list, Posting plan this week, Continue where you left off, Trending in your niche, Ideas for you.
- Empty, loading and load-failed states on Home. Retry-render from the to-do list runs through the engine, with progress and a failure message.
- `src/engine/`: mock engine with all functions in the brief, plus `getSession`, `getHome`, `listProjects`. See `ENGINE_CONTRACT.md`.

- Videos screen (from `reference/Videos.dc.html`): All videos tab with search, Status filter, Sort, table that becomes cards on phones, whole-row link, loading / empty / no-match / load-failed states. Tab is in the URL (`/videos?tab=styles`).
- Styles tab (from the wireframe, restyled): filter chips (All, Suggested, My styles, From references), style cards, "Upload a reference video" with progress, failure + retry.
- New project (`/videos/new`): choose a file, progress bar, failed upload with Try again (reuses the same project, no duplicates), low-resolution warning, then the engine "listens" and offers Choose a style. Record shows an honest "not built yet" note.
- Shared pieces: `Tabs` (keyboard arrows), `UploadProgress`, `format.ts`.

- Video workspace (`/videos/:id`, from `reference/Workspace.dc.html`, with the wireframe for Make more). The page follows the video's state: listening, choose a style (suggested styles, then render with progress), rendering, render failed (Retry the render), then two tabs once rendered (`?tab=more` for the second).
  - Edit tab: preview and simplified timeline, Change the edit (chips, textarea, Preview change shows "Reading this as...", then Apply or Cancel; a rejected change shows the reasons and changes nothing), thumbnails below the edit (Use this), Direction (Punchy/Calm/Cinematic + intensity), Director's notes that change with the preset (an alternative button fills the prompt box), Checks with a working fix, History with Undo/Redo.
  - Make more from this video: six cards (clips, LinkedIn, X thread, carousel, captions, article) with credits, Make it, Open, Review and confirm, Copy, Add to calendar, a failure with Try again, and the "Made from this video" list.
  - Low-resolution warning, not-found page, load-failed states.

- Images (`/images`, from the wireframe, restyled with the tokens): a Create image button (accent, the one primary) opens four starting points (upload, template, video frame, generate with AI) with a small form for each; tabs All, Thumbnails, Carousels, Quote cards (`?type=`); search, From (a video or "Made on its own") and Sort; cards show the right aspect ratio, a ratio tag, status or phone-size check, and a link to the source video. Empty, no-match, load-failed and create-failed states.

- Assets (`/assets`, from the wireframe, restyled): Upload assets (the one accent button), drop zone with Choose files and real drag-and-drop, tabs with counts (All, Product images, Logos, Screenshots, Music; `?type=`), cards with a note (Cut out, Transparent, Low resolution, Labelling…), usage line and a waveform for music. New uploads show "Labelling…" and settle by themselves. Failed upload with Try again, skipped unsupported files listed with the reason, empty, per-tab empty and load-failed states.

- Calendar (`/calendar`, from the wireframe, restyled): "Planning only" tag, Week and Month toggle (`?view=month`), goal box with "Plan it for me" (the one accent button), Previous, Next and Today, a week of seven days starting today (not Monday, so it matches the Home agenda), month grid (on phones it shows a count per day; tap a day to open that week), "Not scheduled yet" chips, and a side panel for the selected post: text, cover, Copy text, Mark as posted, Accept or Remove a suggestion, Move to a day, and links to fix a missing thumbnail or failed render. Drag a post or an unscheduled chip onto a day; Move and Schedule do the same with the keyboard. Past days are refused with a message. Empty, load-failed and action-failed states. Copy failure now says so (also in Make more).
- Home's posting plan and the calendar share one source of truth in the engine.

- Branding (`/branding`, from the wireframe, restyled; tabs Brand kit and Writing voice, `?tab=voice`). Brand kit: Colors (swatches, edit with colour picker plus hex, invalid hex blocked), Fonts (pick headline and body), Logo and handle (Replace logo with progress and retry, Edit handle with validation), and a live Preview slide that shows unsaved changes. Saving can warn about low contrast without blocking. Writing voice: the "What is writing voice?" explainer, Teach us your voice (paste a post, too-short text is explained), What we picked up (tone, sentence length meter, words to use and avoid, emoji) with a working Edit, and Try it (generic vs your voice, with a note when under 2 posts).

- Analytics (`/analytics`, from the wireframe, restyled): "Phase 1" tag and an "Example data" tag while no account is connected; Connect Instagram (the one accent button) and Connect YouTube with a connecting state, a failure message and Disconnect; four summary numbers; Views by day (28 bars, peak highlighted, with a text description and a hidden data table for screen readers); "What seems to work" labelled "Early patterns, not proof"; Try next (links to the calendar or a new project); "Your posts" table with how each was edited (cards on phones); empty and load-failed states.

- Settings & billing (`/settings`, built from the one-line wireframe note, so the layout is mine; tokens for the look): jump links to each part; Plan and credits (plan, renewal, big credits meter, Change plan and Add credits each open a choice with the exact charge shown before the confirm button, the sidebar meter updates); What things cost (table of credits per action); Connected accounts (Instagram, YouTube, same state as Analytics); Export defaults (shape, quality, captions on the video, Save only enabled when something changed); Your data and your account (Download my data, and Delete account with a plain explanation, type DELETE to confirm, a 30-day countdown banner at the top and a one-click "Keep my account").
- The sidebar "Settings & billing" link and the credits meter share the engine's credit total.

- Help (`/help`, built from the one-line wireframe note "Guides, contact and what's new"; layout is mine): tabs Guides, Contact us, What's new (`?tab=`). Guides: search, topic chips, nine short how-tos that open in place with numbered steps and a link into the app, a no-match state that points to Contact us. Contact us: topic, message, reply email, plain validation, a forced-failure path that keeps the message, and a confirmation with a reference and reply time. What's new: dated entries newest first, "New" on anything from the last two weeks.

## What is mocked

- Everything in `src/engine/` (fixture data, fake delays, in-memory state that resets on reload).
- Upload is a real file picker but nothing is sent anywhere; the engine only fakes progress. Recording is not built.
- Styles: "Use" links to `/videos/new?style=<id>` and the page ignores the id. Preview and Edit (in the wireframe) are not built.
- Workspace preview is a placeholder (no real video; the play button is decoration), and timeline blocks are read-only.
- Share for review and Export are enabled once rendered but only show a "not connected yet" message.
- Thumbnail Edit (in the wireframe) is not built; there is a link to Images instead.
- Add to calendar (from a video) puts an entry on the first free day this week.
- Help: the guides, release notes, reply time and ticket reference are invented text and numbers. Nothing is sent anywhere; the message is only validated and acknowledged. The guides describe this prototype, so they must be rewritten when the real engine changes behaviour.
- Settings: plans, prices, credit packs and "Visa ending 4242" are invented fixtures. No money moves and no card details are collected anywhere. Credits are never spent by actions, so the meter only changes when plans or packs change. Export defaults are saved but the workspace Export button (itself not connected) does not read them. Deleting an account only sets a date in memory.
- Analytics: every number is fixture data. "Connect" does not open a sign-in; it just flips the screen to the connected state after 1.5 s, and the numbers stay the same (the real engine must return the user's own). The chart is a simple bar chart without hover values (the values are in the hidden table and the summary). There is no date range picker.
- Branding: nothing is really learned from pasted posts (the mock only counts them and keeps the same summary and example), and fonts that are not loaded in the browser show a stand-in in the preview. The logo is a placeholder gradient after a replace. The sample brand colours are the wireframe's teal and amber: they are the user's brand data and do not change the app's own accent.
- Calendar: "Plan it for me" adds three canned suggestions on empty days, whatever the goal says. "Download image" from the wireframe is not built. Covers are gradients. Dates are relative to today when the page loads, and everything resets on reload.
- Credits shown on cards and the AI image cost are not spent.
- Assets: nothing is labelled or cut out for real (the mock just waits 3 s). Cards cannot be opened, renamed or deleted, and no asset is actually used in a video yet. Pictures are gradients with the name.
- Images: image cards are not openable (there is no image editor yet), so a draft cannot be edited, downloaded or deleted. Generated and uploaded images use placeholder gradients. Carousel, quote and thumbnail looks are gradients with the caption text.
- "Search everything" is a button that does nothing yet.
- Save (ideas) toggles locally only. Add (posting plan on Home) is real: it accepts the suggestion in the calendar. "Make this" and "Start" link to `/videos/new?trend=` / `?idea=`.
- Brand switcher works but there is only one brand in the fixtures.

## Decisions where the brief and the design disagree (brief wins)

- Only "Upload a video" uses the accent colour as a button. The design also had accent buttons on "Choose style" and "Start"; those are black or outlined here.
- Duration badges on video cards are dark, not accent.
- Card radius is 16px everywhere (the design had 20px on the Start card), thumbnails 12px.
- Trend cards with no source image show no image area (the design showed a grey "No image" box).
- Added tokens not in the brief: `--surface-tint` (#F9F9F9) and `--line-strong` (#CCCCCC), both taken from the design file.

- "Three emails we stopped sending" is Step 4 · Thumbnail on Home and Videos (your decision), although the Videos design says "Ready to post".
- Workspace: only Export is the accent button. "Preview change", "Apply change", "Use this style", "Make it" and the selected thumbnail button are black. The selected Direction preset and selected thumbnail use the accent outline (the design used a filled accent segment).
- The wireframe says timeline blocks are tappable; they are read-only here and the page says so, because nothing can adjust them yet.
- Filter/sort controls are native selects styled as pills, so they work with keyboard and screen readers.

## Tested in a real browser (Browser pane, Chromium)

- Home at 1440, 1024, 768, 375 and 320 px wide: no horizontal scroll.
- All 12 routes at 320 px: no horizontal scroll.
- Phone menu opens, shows all items, closes after choosing a link; current page is marked.
- Retry render: progress, then forced failure message, then a successful retry that updates the card and to-do list.
- Fonts (Schibsted Grotesk, Instrument Sans) load. No console errors.
- `tsc --noEmit` and `vite build` pass.

- Step 2: Videos and Styles at 1440 (screenshot vs design) and 320 px (no horizontal scroll on /videos, ?tab=styles, /videos/new, record view). Search, status filter, sort, no-match state, arrow-key tab switching, style filter chips, reference upload adds a style, upload failure then retry (via `window.__engine.failNext('upload')`), low-resolution warning, project reused on retry.
- Step 3 at 1440 (screenshot vs design) and 320 px (no horizontal scroll on /videos/p1, p2, p2?tab=more, p3 and a missing id). Scripted: preset change updates notes, timeline markers and history; chip, Preview change, Reading this as, Apply; a rejected change ("zoom in closer") changes nothing; Reduce zoom clears the soft-zoom check; Undo and Redo move the current version and the check; one intensity drag makes one history entry; thumbnail choice; choose a style, render progress, forced render failure, Retry the render, then the tabs appear; Make more cards, forced text failure and retry, review and confirm the carousel, Add to calendar; low-resolution banner; a video still listening finishes analysing; not-found page.

- Images at 1440 (screenshot) and 320 px (no horizontal scroll, closed and with the create panel open). Scripted: tab filter, search, no-match and Clear filters, From filter, sort, all four create paths, AI failure then retry (`failNext('image')`), image upload with accept=image/*, new items appear at the top and the panel closes.

- Assets at 1440 (screenshot) and 320 px (no horizontal scroll). Scripted: tab counts and filter, failed upload then retry, mixed batch (good, unsupported, low-res, audio) with the skipped file explained, labelling settles without a reload, counts update, drag-and-drop.

- Calendar at 1440 (screenshot) and 320 px (week and month, no horizontal scroll). Scripted: select a post, accept a suggestion, Copy text, Mark as posted, Move to a day, schedule an unscheduled item, drag an unscheduled chip onto a day (synthetic drag events), Plan it for me (button shows Planning…, three suggestions appear), Previous, Next, Today, Month grid, open a week from a month day, Home's Add now accepts the suggestion in the calendar.

- Branding at 1440 (screenshot) and 320 px (both tabs, editing open, no horizontal scroll). Scripted: invalid hex blocks Save, live preview follows edits, saved colours with a low-contrast warning, font change, bad and good handle, logo upload failure then retry, arrow-key tab switch, short post refused, post added (2 to 3), empty tone refused, edit and save tone, sentence length, words and emoji.

- Analytics at 1440 (screenshot) and 320 px (no horizontal scroll, posts as cards). Scripted: example tag and chart summary, connect failure then success (tag and heading change), Disconnect brings the example back, links in Try next and Your posts.

- Settings at 1440 (screenshot) and 320 px (no horizontal scroll, plan panel open). Scripted: buy credits with a forced payment failure then success (total and sidebar both update), upgrade to Studio with the charge shown first, downgrade to Free refused with a reason, connect failure then success, export defaults save (button disabled until changed), Download my data, Delete needs exactly DELETE, scheduled banner, Keep my account removes it.

- Help at 1440 (screenshot) and 320 px (no horizontal scroll). Scripted: topic filter and search, no-match and Clear search, guide opens with a working link, contact form (bad email, too-short message, forced failure keeps the text, success shows a reference, Send another clears it), arrow-key tab switch, What's new with a "New" tag only on the latest.
- Final pass: all 19 routes and tab variants at 320 px with no horizontal scroll (the only wide elements are visually hidden table headers). `tsc --noEmit` and `vite build` pass.

## Not tested

- Settings: the page was built from a one-line note, so it has not been compared with any design. Real payments, a card form, and email delivery do not exist.

- Calendar: real mouse dragging, dragging on touch screens (use Move or Schedule there), Copy text actually writing to the clipboard (the test browser would not allow it, so only the failure message path was seen), and the month view on phones beyond a screenshot of its top.

- Assets: a real drag from the desktop (the drop was simulated with a synthetic event).

- Keyboard-only walkthrough and visible focus rings (styles exist, not walked through).
- Screen reader behaviour.
- 4.5:1 contrast was checked by reasoning from the token values, not measured with a tool.
- Safari, Firefox, real phones.
- Brand switcher menu with more than one brand.
- Side-by-side pixel comparison against `Main.dc.html` (compared by eye at 1440 only).

## Next

Every screen in the plan now exists against the mock engine. What is left is replacing the mock, then:

1. Hand `ENGINE_CONTRACT.md` to the engine developer and settle the "Not in the contract yet" lists in it.
2. A keyboard-only and screen-reader pass over every screen, and a contrast check with a tool (both are still untested).
3. Real previews, a recorder for "Record now", thumbnail and image editing, and an Export that uses the export defaults. These need the engine.
