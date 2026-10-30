// Mock engine. The UI imports ONLY from here, never from ./fixtures.
// The real engine replaces this module and keeps these signatures (see ENGINE_CONTRACT.md).
import * as fx from './fixtures';
import * as analyticsFixtures from './fixtures-analytics';
import * as helpFixtures from './fixtures-help';
import { assets as assetFixtures } from './fixtures-assets';
import { brandKit as brandKitFixture, fonts as fontList, voice as voiceFixture, voiceOptions as voiceOptionsFixture } from './fixtures-brand';
import { images as imageFixtures } from './fixtures-images';
import {
  EngineError,
  type Check,
  type Direction,
  type DirectionState,
  type History,
  type InterpretedRequest,
  type MadeItem,
  type MakeMoreItem,
  type Timeline,
  type AnalyticsData,
  type AccountStatus,
  type AssetItem,
  type Billing,
  type BillingPlan,
  type ConnectedAccount,
  type CostItem,
  type CreditPack,
  type ExportDefaults,
  type Guide,
  type ReleaseNote,
  type SupportInfo,
  type SupportRequest,
  type Platform,
  type BrandColors,
  type BrandKit,
  type BrandKitSave,
  type VoiceOptions,
  type VoiceProfile,
  type CalendarData,
  type CalendarEntry,
  type Channel,
  type AssetKind,
  type AssetUploadResult,
  type HomeData,
  type ImageItem,
  type ImageStart,
  type MediaCard,
  type Patch,
  type PatchResult,
  type Plan,
  type PlanEntry,
  type Project,
  type RenderJob,
  type Session,
  type StyleSuggestion,
  type TextAsset,
  type TextKind,
  type ThumbnailOption,
  type UnscheduledItem,
  type TodoItem,
  type UploadResult,
  type VideoStyle,
} from './types';

export * from './types';

// ---- helpers ----

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms * (0.7 + Math.random() * 0.6)));

const clone = <T>(v: T): T => structuredClone(v);

// In-memory state. Resets on reload.
const projects: Project[] = clone(fx.projects);
const plans = new Map<string, { history: Plan[]; index: number; labels: string[] }>();

function findProject(id: string): Project {
  const p = projects.find((x) => x.id === id);
  if (!p) throw new EngineError('NOT_FOUND', `No project with id ${id}`, false);
  return p;
}

/** Test switches for failure states. Also on `window.__engine` in dev. */
const failNext = { upload: false, render: false, text: false, image: false, connect: false, payment: false, support: false };
export const mockControls = {
  failNext(kind: 'upload' | 'render' | 'text' | 'image' | 'connect' | 'payment' | 'support') {
    failNext[kind] = true;
  },
};
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __engine: typeof mockControls }).__engine = mockControls;
}

// ---- account and Home ----

export async function getSession(): Promise<Session> {
  await wait(250);
  return clone({ userName: fx.userName, brands: fx.brands, credits: creditsState });
}

function todoFor(p: Project): TodoItem | null {
  if (p.status === 'choose-style')
    return { id: `todo-${p.id}`, kind: 'choose-style', title: 'Choose a style', detail: `${p.title} · 3 suggestions`, projectId: p.id, severity: 'warn', actionLabel: 'Choose style' };
  if (p.status === 'thumbnail')
    return { id: `todo-${p.id}`, kind: 'approve-thumbnail', title: 'Approve a thumbnail', detail: `${p.title} · 3 options`, projectId: p.id, severity: 'warn', actionLabel: 'Review' };
  if (p.status === 'render-failed')
    return { id: `todo-${p.id}`, kind: 'retry-render', title: 'Retry the render', detail: `${p.title} · your footage is safe`, projectId: p.id, severity: 'error', actionLabel: 'Retry' };
  return null;
}

export async function getHome(brandId: string): Promise<HomeData> {
  await wait(450);
  const mine = projects.filter((p) => p.brandId === brandId);
  return clone({
    todo: mine.map(todoFor).filter((t): t is TodoItem => t !== null),
    week: await planCalendar(brandId),
    recent: mine,
    trends: fx.trends,
    ideas: fx.ideas,
  });
}

export async function listProjects(brandId: string): Promise<Project[]> {
  await wait(300);
  return clone(projects.filter((p) => p.brandId === brandId));
}

// ---- styles library ----

const styles: VideoStyle[] = clone(fx.videoStyles);

export async function listStyles(brandId: string): Promise<VideoStyle[]> {
  void brandId;
  await wait(400);
  return clone(styles);
}

/** Builds a style from a reference video the user uploaded. Same failure behaviour as uploadVideo. */
export async function createStyleFromReference(
  brandId: string,
  file: { name: string; size: number },
  onProgress: (fraction: number) => void,
): Promise<VideoStyle> {
  void brandId;
  const shouldFail = failNext.upload || /fail/i.test(file.name);
  failNext.upload = false;
  for (let i = 1; i <= 10; i++) {
    await wait(150);
    onProgress(i / 10);
    if (shouldFail && i === 5)
      throw new EngineError('UPLOAD_FAILED', 'The upload stopped at 50%. Nothing was lost, try again.');
  }
  const style: VideoStyle = {
    id: `vs${Date.now()}`,
    name: file.name.replace(/\.[^.]+$/, '') || 'New style',
    description: 'Copied: pacing, caption timing. Approximated: fonts, custom effects.',
    origin: 'mine',
    fromReference: true,
    poster: { from: '#E9DDD3', to: '#B7A294' },
  };
  styles.push(style);
  return clone(style);
}

// ---- projects ----

export async function createProject(input: {
  brandId: string;
  title?: string;
  source: 'upload' | 'record';
}): Promise<Project> {
  await wait(300);
  const project: Project = {
    id: `p${Date.now()}`,
    brandId: input.brandId,
    title: input.title ?? 'Untitled video',
    durationSec: 0,
    source: input.source,
    status: 'listening',
    step: 1,
    stepLabel: 'Waiting for your video',
    poster: { from: '#E9DDD3', to: '#C9B5A6' },
    updatedAt: 'Today',
    madeFrom: { videos: 0, thumbnails: 0, posts: 0 },
  };
  projects.unshift(project);
  return clone(project);
}

export async function uploadVideo(
  projectId: string,
  file: { name: string; size: number },
  onProgress: (fraction: number) => void,
): Promise<UploadResult> {
  const project = findProject(projectId);
  const shouldFail = failNext.upload || /fail/i.test(file.name);
  failNext.upload = false;
  for (let i = 1; i <= 10; i++) {
    await wait(180);
    onProgress(i / 10);
    if (shouldFail && i === 6)
      throw new EngineError('UPLOAD_FAILED', 'The connection dropped at 60%. Nothing was lost, try again.');
  }
  const lowRes = /lowres|720|480/i.test(file.name);
  project.resolution = lowRes ? { width: 1280, height: 720 } : { width: 1080, height: 1920 };
  project.durationSec = 90;
  const warnings = lowRes
    ? ['This video is 1280 × 720. It will look soft if we zoom in, so we will keep zooms small.']
    : [];
  return clone({ project, warnings });
}

export async function analyse(projectId: string): Promise<MediaCard> {
  const p = findProject(projectId);
  await wait(1200);
  p.status = 'choose-style';
  p.step = 2;
  p.stepLabel = 'Choose a style';
  return {
    projectId,
    durationSec: p.durationSec || 182,
    language: 'English',
    transcript: [
      { startSec: 0, endSec: 6, text: 'We used to take two weeks to onboard a new customer.' },
      { startSec: 6, endSec: 14, text: 'Now it takes three days, and here is what changed.' },
      { startSec: 14, endSec: 24, text: 'First, we stopped sending three emails nobody read.' },
    ],
    shots: [
      { startSec: 0, endSec: 14, label: 'Talking head', quality: 'ok' },
      { startSec: 14, endSec: 31, label: 'Screen share', quality: 'ok' },
      { startSec: 31, endSec: 48, label: 'Talking head, wide', quality: p.resolution && p.resolution.height < 1080 ? 'soft' : 'ok' },
    ],
  };
}

export async function suggestStyles(projectId: string): Promise<StyleSuggestion[]> {
  findProject(projectId);
  await wait(700);
  return clone(fx.styleSuggestions);
}

// ---- plan, direction, patches ----

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DEFAULT_DIRECTION: Direction = { preset: 'punchy', intensity: 60 };
const directionOf = (plan: Plan): Direction => (plan.data.direction as Direction | undefined) ?? DEFAULT_DIRECTION;

function planStore(projectId: string) {
  const p = findProject(projectId);
  let s = plans.get(projectId);
  if (!s) {
    s = { history: [{ projectId, revision: 1, data: {} }], labels: ['Raw upload'], index: 0 };
    if (p.step >= 3) {
      s.history.push({ projectId, revision: 2, data: { direction: DEFAULT_DIRECTION } });
      s.labels.push('First edit (Punchy)');
    }
    if (p.step >= 4) {
      s.history.push({ projectId, revision: 3, data: { direction: DEFAULT_DIRECTION, 'captions.size': 'large' } });
      s.labels.push('Bigger captions');
    }
    s.index = s.history.length - 1;
    plans.set(projectId, s);
  }
  return s;
}

function commit(projectId: string, label: string, data: Record<string, unknown>): Plan {
  const s = planStore(projectId);
  const cur = s.history[s.index];
  const next: Plan = { projectId, revision: cur.revision + 1, data: { ...cur.data, ...data } };
  s.history = [...s.history.slice(0, s.index + 1), next];
  s.labels = [...s.labels.slice(0, s.index + 1), label];
  s.index = s.history.length - 1;
  return next;
}

function checksFor(plan: Plan): Check[] {
  const zoom = plan.data['zoom.max'];
  const fixed = typeof zoom === 'number' && zoom <= 1.5;
  return fx.checks.map((c) => (c.id === 'c3' && fixed ? { id: 'c3', label: 'Zoom OK', severity: 'ok' as const } : c));
}

function directionState(plan: Plan): DirectionState {
  const direction = directionOf(plan);
  return clone({ direction, notes: fx.directorNotes[direction.preset], checks: checksFor(plan), plan });
}

export async function getPlan(projectId: string): Promise<Plan> {
  await wait(250);
  const s = planStore(projectId);
  return clone(s.history[s.index]);
}

export async function getDirection(projectId: string): Promise<DirectionState> {
  await wait(300);
  const s = planStore(projectId);
  return directionState(s.history[s.index]);
}

export async function setDirection(projectId: string, direction: Direction): Promise<DirectionState> {
  await wait(400);
  const s = planStore(projectId);
  const before = directionOf(s.history[s.index]);
  const label =
    before.preset === direction.preset && s.history[s.index].data.direction
      ? `Intensity ${direction.intensity}`
      : `Direction: ${cap(direction.preset)}`;
  return directionState(commit(projectId, label, { direction }));
}

export async function getTimeline(projectId: string): Promise<Timeline> {
  await wait(250);
  const s = planStore(projectId);
  const { preset } = directionOf(s.history[s.index]);
  const zooms = { punchy: [6, 31, 62, 81], calm: [48], cinematic: [20, 70] }[preset];
  return {
    previewCaption: 'cut onboarding to three days',
    tracks: [
      { id: 'video', label: 'Video', blocks: [{ left: 0, width: 22, tone: 'solid' }, { left: 23, width: 30, tone: 'muted' }, { left: 54, width: 46, tone: 'solid' }] },
      { id: 'camera', label: 'Camera', blocks: zooms.map((left) => ({ left, width: 1, tone: 'marker' as const })) },
      { id: 'captions', label: 'Captions', blocks: [{ left: 2, width: 94, tone: 'light' }] },
      { id: 'assets', label: 'Assets', blocks: [{ left: 40, width: 10, tone: 'muted' }, { left: 70, width: 8, tone: 'muted' }] },
      { id: 'audio', label: 'Audio', blocks: [{ left: 0, width: 100, tone: 'light' }] },
    ],
  };
}

/** Turns the user's words into a patch and says, in plain words, what it understood. Nothing is applied yet. */
export async function interpretRequest(projectId: string, text: string): Promise<InterpretedRequest> {
  findProject(projectId);
  await wait(500);
  const t = text.toLowerCase();
  const make = (reading: string, previewNote: string, label: string, ops: Patch['ops']): InterpretedRequest => ({
    reading,
    previewNote,
    patch: { label, ops },
  });
  if (/zoom/.test(t) && /(more|closer|bigger|stronger)/.test(t))
    return make('Zoom in closer on the key moments.', '0:28 to 0:36', 'More zoom', [{ path: 'zoom.max', value: 2 }]);
  if (/caption/.test(t) && /(big|larger)/.test(t))
    return make('Make the captions larger.', '0:00 to 0:10', 'Bigger captions', [{ path: 'captions.size', value: 'large' }]);
  if (/slow/.test(t))
    return make('Cut less often, about every 4 seconds.', '0:10 to 0:20', 'Slower cuts', [{ path: 'cuts.interval', value: 4 }]);
  if (/(stat|callout)/.test(t))
    return make('Add a stat callout at 0:12.', '0:08 to 0:18', 'Stat callout at 0:12', [{ path: 'assets.callout', value: { at: 12 } }]);
  if (/(fewer|less|effect)/.test(t))
    return make('Use fewer effects.', '0:00 to 0:12', 'Fewer effects', [{ path: 'effects', value: 'minimal' }]);
  const short = text.trim().slice(0, 40);
  return make(text.trim(), '0:00 to 0:10', short, [{ path: 'request', value: text.trim() }]);
}

export async function applyPatch(projectId: string, patch: Patch): Promise<PatchResult> {
  await wait(600);
  planStore(projectId);
  const reasons: string[] = [];
  for (const op of patch.ops) {
    if (!op.path) reasons.push('A change is missing what it applies to.');
    if (op.path === 'zoom.max' && typeof op.value === 'number' && op.value > 1.5)
      reasons.push('That zoom would crop a 720p clip and look soft. Try 1.5x or less.');
  }
  if (reasons.length) return { ok: false, reasons };
  const plan = commit(projectId, patch.label, Object.fromEntries(patch.ops.map((o) => [o.path, o.value])));
  return { ok: true, plan: clone(plan) };
}

export async function undo(projectId: string): Promise<Plan> {
  await wait(200);
  const s = planStore(projectId);
  if (s.index > 0) s.index -= 1;
  return clone(s.history[s.index]);
}

export async function redo(projectId: string): Promise<Plan> {
  await wait(200);
  const s = planStore(projectId);
  if (s.index < s.history.length - 1) s.index += 1;
  return clone(s.history[s.index]);
}

export async function getHistory(projectId: string): Promise<History> {
  await wait(150);
  const s = planStore(projectId);
  const entries = s.history.map((p, i) => ({ revision: p.revision, label: s.labels[i], current: i === s.index })).reverse();
  return { entries, canUndo: s.index > 0, canRedo: s.index < s.history.length - 1 };
}

export async function getProject(projectId: string): Promise<Project> {
  await wait(250);
  return clone(findProject(projectId));
}

// ---- render ----

/**
 * Starts a render and calls onProgress with each update. Resolves with the final job
 * (status 'done' or 'failed'). A failed render never throws, so the UI can show a retry.
 * While it runs, getProject() reports status 'rendering' and renderProgress.
 */
export async function startRender(
  projectId: string,
  onProgress: (job: RenderJob) => void,
): Promise<RenderJob> {
  const p = findProject(projectId);
  const shouldFail = failNext.render;
  failNext.render = false;
  const job: RenderJob = { id: `r${Date.now()}`, projectId, status: 'queued', progress: 0 };
  onProgress({ ...job });
  p.status = 'rendering';
  p.step = 3;
  p.stepLabel = 'Rendering';
  p.renderProgress = 0;
  job.status = 'rendering';
  for (let i = 1; i <= 10; i++) {
    await wait(260);
    job.progress = i / 10;
    p.renderProgress = job.progress;
    if (shouldFail && i === 7) {
      job.status = 'failed';
      job.error = 'The render stopped at 70%. Your footage is safe, try again.';
      p.status = 'render-failed';
      p.stepLabel = 'Render needs a retry';
      delete p.renderProgress;
      onProgress({ ...job });
      return { ...job };
    }
    onProgress({ ...job });
  }
  job.status = 'done';
  job.progress = 1;
  p.status = 'thumbnail';
  p.step = 4;
  p.stepLabel = 'Thumbnail';
  delete p.renderProgress;
  onProgress({ ...job });
  return { ...job };
}

// ---- thumbnails ----

const thumbChoice = new Map<string, string>();

function thumbList(projectId: string): ThumbnailOption[] {
  const chosen = thumbChoice.get(projectId) ?? 'th1';
  return clone(fx.thumbnails).map((t) => ({ ...t, selected: t.id === chosen }));
}

export async function listThumbnails(projectId: string): Promise<ThumbnailOption[]> {
  findProject(projectId);
  await wait(600);
  return thumbList(projectId);
}

export async function selectThumbnail(projectId: string, thumbnailId: string): Promise<ThumbnailOption[]> {
  findProject(projectId);
  await wait(300);
  thumbChoice.set(projectId, thumbnailId);
  return thumbList(projectId);
}

// ---- text assets, "Make more from this video", calendar ----

const textFixtures: Record<TextKind, { title: string; body: string; parts?: string[] }> = {
  clips: { title: '2 clips', body: 'Short moments worth posting on their own.', parts: ['0:00 to 0:14 The 14-day problem', '0:31 to 0:48 The 3-day result'] },
  linkedin: { title: 'LinkedIn post', body: 'We used to take 14 days to onboard a customer. Now it takes 3.\n\nHere is what we stopped doing:\n\n1. Sending three emails nobody read.\n2. Booking a kickoff call before anyone had logged in.\n3. Waiting for a "perfect" setup before the first win.\n\nThe result: customers reach their first win in three days, not two weeks.' },
  'x-thread': { title: 'X thread, 7 posts', body: 'Onboarding used to take us 14 days.', parts: ['Onboarding used to take us 14 days.', 'We cut it to 3. Thread:', '1/ We stopped sending three emails nobody read.'] },
  carousel: { title: 'Carousel, 5 slides', body: 'From 14 days to 3.', parts: ['14 days', 'The problem', 'What we cut', 'What we kept', '3 days'] },
  captions: { title: 'Captions and hashtags', body: 'Instagram: We cut onboarding from 14 days to 3. Here is how. #saas #onboarding\n\nTikTok: 14 days to 3. #saas #startup\n\nYouTube Shorts: How we cut onboarding to 3 days #shorts' },
  article: { title: 'Article, about 900 words', body: 'Why we cut onboarding from 14 days to 3\n\nFor years our onboarding took two weeks…' },
};

const MAKE_META: Record<TextKind, { title: string; description: string; credits: number }> = {
  clips: { title: 'Short clips', description: 'Best moments cut into their own vertical videos, each with a hook, captions and thumbnail.', credits: 120 },
  linkedin: { title: 'LinkedIn post', description: 'A post with a strong first line, based on your key points. About 1,200 characters.', credits: 5 },
  'x-thread': { title: 'X thread', description: 'Your story as 7 short posts, each under the character limit.', credits: 5 },
  carousel: { title: 'Instagram carousel', description: '5 swipeable slides in your brand colours. One number needs your confirmation.', credits: 10 },
  captions: { title: 'Captions and hashtags', description: 'A caption for each platform you post to: Instagram, TikTok, YouTube Shorts.', credits: 2 },
  article: { title: 'Article', description: 'A blog post of about 900 words with a title and meta description, based on your transcript.', credits: 15 },
};
const KIND_ORDER: TextKind[] = ['clips', 'linkedin', 'x-thread', 'carousel', 'captions', 'article'];

const assets = new Map<string, TextAsset[]>();
const scheduled = new Set<string>();

function assetsOf(projectId: string): TextAsset[] {
  let list = assets.get(projectId);
  if (!list) {
    list = [];
    if (projectId === 'p2') {
      list.push({ id: 'a-p2-linkedin', projectId, kind: 'linkedin', status: 'ready', ...clone(textFixtures.linkedin) });
      list.push({ id: 'a-p2-carousel', projectId, kind: 'carousel', status: 'needs-review', ...clone(textFixtures.carousel) });
    }
    assets.set(projectId, list);
  }
  return list;
}

export async function getMakeMore(projectId: string): Promise<MakeMoreItem[]> {
  findProject(projectId);
  await wait(300);
  const list = assetsOf(projectId);
  return KIND_ORDER.map((kind) => {
    const meta = MAKE_META[kind];
    const asset = list.find((a) => a.kind === kind);
    if (asset) return { kind, title: meta.title, description: meta.description, status: asset.status };
    return {
      kind,
      title: meta.title,
      description: meta.description,
      status: kind === 'clips' ? ('found' as const) : ('not-made' as const),
      badge: kind === 'clips' ? '2 found' : undefined,
      credits: meta.credits,
    };
  });
}

export async function getTextAsset(projectId: string, kind: TextKind): Promise<TextAsset | null> {
  findProject(projectId);
  await wait(150);
  return clone(assetsOf(projectId).find((a) => a.kind === kind) ?? null);
}

export async function generateText(projectId: string, kind: TextKind): Promise<TextAsset> {
  findProject(projectId);
  await wait(900);
  if (failNext.text) {
    failNext.text = false;
    throw new EngineError('TEXT_FAILED', 'We could not write that one. You were not charged, try again.');
  }
  const list = assetsOf(projectId);
  const existing = list.find((a) => a.kind === kind);
  if (existing) return clone(existing);
  const asset: TextAsset = {
    id: `a${Date.now()}`,
    projectId,
    kind,
    status: kind === 'carousel' ? 'needs-review' : 'ready',
    ...clone(textFixtures[kind]),
  };
  list.push(asset);
  return clone(asset);
}

/** The user confirmed the flagged item (for example the number on a carousel slide). */
export async function approveText(projectId: string, kind: TextKind): Promise<TextAsset> {
  await wait(300);
  const asset = assetsOf(projectId).find((a) => a.kind === kind);
  if (!asset) throw new EngineError('NOT_FOUND', 'That has not been made yet.', false);
  asset.status = 'ready';
  return clone(asset);
}

export async function listMadeFromVideo(projectId: string): Promise<MadeItem[]> {
  const p = findProject(projectId);
  await wait(250);
  const items: MadeItem[] = [];
  if (p.step >= 4) {
    const s = planStore(projectId);
    const { preset } = directionOf(s.history[s.index]);
    const thumb = thumbList(projectId).find((t) => t.selected);
    items.push({
      id: `${projectId}-video`,
      type: 'video',
      title: 'Edited video',
      detail: `${Math.floor(p.durationSec / 60)}:${String(p.durationSec % 60).padStart(2, '0')} · ${cap(preset)}`,
      status: 'ready',
      poster: p.poster,
      scheduled: scheduled.has(`${projectId}-video`),
    });
    if (thumb)
      items.push({
        id: `${projectId}-thumb`,
        type: 'thumbnail',
        title: `Thumbnail, ${thumb.label}`,
        detail: 'Checked at phone size',
        status: 'ready',
        poster: thumb.poster,
        scheduled: scheduled.has(`${projectId}-thumb`),
      });
  }
  for (const a of assetsOf(projectId))
    items.push({
      id: a.id,
      type: 'text',
      kind: a.kind,
      title: MAKE_META[a.kind].title,
      detail: a.parts ? `${a.parts.length} parts` : `${a.body.length.toLocaleString('en-US')} characters`,
      status: a.status,
      scheduled: scheduled.has(a.id),
    });
  return clone(items);
}

const CHANNEL: Partial<Record<TextKind, Channel>> = { linkedin: 'LinkedIn', 'x-thread': 'X' };

// ---- calendar ----

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s: string) => new Date(`${s}T00:00:00`);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const todayDate = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const dayOffset = (n: number) => iso(addDays(todayDate(), n));
const byTime = (a: CalendarEntry, b: CalendarEntry) => (a.date + a.time).localeCompare(b.date + b.time);

let calendarGoal = 'Get 20 demo requests from the onboarding series in the next 2 weeks';

const calendar: CalendarEntry[] = [
  { id: 'c1', date: dayOffset(0), time: '09:00', channel: 'LinkedIn', title: 'Post: “14 days to 3”', status: 'ready', projectId: 'p1', text: "We cut onboarding from 14 days to 3. Here's what we changed first, and what we stopped doing…", image: { from: '#2A1D20', to: '#2F3E4A' }, imageLabel: '14 → 3 days' },
  { id: 'c2', date: dayOffset(2), time: '12:00', channel: 'Instagram', title: 'Reel: “Three emails”', status: 'needs-thumbnail', projectId: 'p2' },
  { id: 'c3', date: dayOffset(2), time: '15:00', channel: 'X', title: 'Thread: 7 posts', status: 'ready', projectId: 'p2', text: 'Onboarding used to take us 14 days.\n\nWe cut it to 3. Thread:' },
  { id: 'c4', date: dayOffset(3), time: '10:00', channel: 'Instagram', title: 'Suggested: carousel', status: 'suggestion', projectId: 'p1' },
  { id: 'c5', date: dayOffset(4), time: '11:00', channel: 'YouTube Shorts', title: 'Short: “Pricing teardown”', status: 'render-retry', projectId: 'p3' },
];

let unscheduled: UnscheduledItem[] = [
  { id: 'u1', label: 'Article: onboarding', channel: 'LinkedIn', projectId: 'p1', text: 'Why we cut onboarding from 14 days to 3…' },
  { id: 'u2', label: 'Quote card: “Onboarding is the product.”', channel: 'Instagram', image: { from: '#F2F2F2', to: '#E5E5E5' } },
  { id: 'u3', label: 'Quote card: “Ask the customer first.”', channel: 'Instagram', image: { from: '#E9DDD3', to: '#C9B5A6' } },
  { id: 'u4', label: 'Short clip: the 14-day problem', channel: 'YouTube Shorts', projectId: 'p1' },
];

function calendarEntry(id: string): CalendarEntry {
  const e = calendar.find((x) => x.id === id);
  if (!e) throw new EngineError('NOT_FOUND', 'That post is no longer on your calendar.', false);
  return e;
}

function assertNotPast(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < dayOffset(0))
    throw new EngineError('INVALID_DATE', 'That day has passed. Pick today or a later day.', false);
}

/** Entries from `from` to `to` (inclusive, YYYY-MM-DD), plus everything not yet scheduled and the current goal. */
export async function getCalendar(brandId: string, from: string, to: string): Promise<CalendarData> {
  void brandId;
  await wait(350);
  return clone({
    entries: calendar.filter((e) => e.date >= from && e.date <= to).sort(byTime),
    unscheduled,
    goal: calendarGoal,
  });
}

const SUGGESTIONS: { title: string; channel: Channel }[] = [
  { title: 'Suggested: LinkedIn post from your best moment', channel: 'LinkedIn' },
  { title: 'Suggested: short clip of the pricing answer', channel: 'YouTube Shorts' },
  { title: 'Suggested: quote card', channel: 'Instagram' },
];

/** Fills empty days in the next two weeks with suggestions for the goal. Nothing is posted. */
export async function planForGoal(brandId: string, goal: string): Promise<CalendarEntry[]> {
  void brandId;
  await wait(1600);
  calendarGoal = goal.trim();
  const taken = new Set(calendar.map((e) => e.date));
  const added: CalendarEntry[] = [];
  for (let i = 1; i < 14 && added.length < SUGGESTIONS.length; i++) {
    const date = dayOffset(i);
    if (taken.has(date)) continue;
    const s = SUGGESTIONS[added.length];
    const entry: CalendarEntry = { id: `c${Date.now()}${i}`, date, time: '09:00', channel: s.channel, title: s.title, status: 'suggestion' };
    calendar.push(entry);
    added.push(entry);
  }
  return clone(added);
}

export async function moveEntry(brandId: string, entryId: string, date: string, time?: string): Promise<CalendarEntry> {
  void brandId;
  await wait(250);
  const e = calendarEntry(entryId);
  assertNotPast(date);
  e.date = date;
  if (time) e.time = time;
  return clone(e);
}

/** Gives a made-but-unscheduled item a day. */
export async function scheduleItem(brandId: string, itemId: string, date: string): Promise<CalendarEntry> {
  void brandId;
  await wait(250);
  const item = unscheduled.find((u) => u.id === itemId);
  if (!item) throw new EngineError('NOT_FOUND', 'That item was already scheduled.', false);
  assertNotPast(date);
  unscheduled = unscheduled.filter((u) => u.id !== itemId);
  const entry: CalendarEntry = {
    id: `c${Date.now()}`,
    date,
    time: '09:00',
    channel: item.channel,
    title: item.label,
    status: 'ready',
    projectId: item.projectId,
    text: item.text,
    image: item.image,
  };
  calendar.push(entry);
  return clone(entry);
}

export async function acceptSuggestion(brandId: string, entryId: string): Promise<CalendarEntry> {
  void brandId;
  await wait(250);
  const e = calendarEntry(entryId);
  e.status = 'ready';
  e.title = e.title.replace(/^Suggested: /, '');
  return clone(e);
}

export async function removeEntry(brandId: string, entryId: string): Promise<void> {
  void brandId;
  await wait(200);
  calendarEntry(entryId);
  calendar.splice(calendar.findIndex((x) => x.id === entryId), 1);
}

/** The user posted it themselves and is telling us. We never post for them. */
export async function markPosted(brandId: string, entryId: string): Promise<CalendarEntry> {
  void brandId;
  await wait(200);
  const e = calendarEntry(entryId);
  e.status = 'posted';
  return clone(e);
}

/** Puts something made from a video onto the calendar on the first free day this week. */
export async function addToCalendar(projectId: string, itemId: string): Promise<CalendarEntry> {
  const items = await listMadeFromVideo(projectId);
  const item = items.find((i) => i.id === itemId);
  if (!item) throw new EngineError('NOT_FOUND', 'That item no longer exists.', false);
  await wait(300);
  scheduled.add(itemId);
  const taken = new Set(calendar.map((e) => e.date));
  let offset = 1;
  while (offset < 7 && taken.has(dayOffset(offset))) offset++;
  const asset = assetsOf(projectId).find((a) => a.id === itemId);
  const entry: CalendarEntry = {
    id: `c${Date.now()}`,
    date: dayOffset(offset),
    time: '09:00',
    channel: (item.kind && CHANNEL[item.kind]) || 'Instagram',
    title: item.title,
    status: 'ready',
    projectId,
    text: asset ? [asset.body, ...(asset.parts ?? [])].join('\n') : undefined,
    image: item.poster,
  };
  calendar.push(entry);
  return clone(entry);
}

const STATUS_TO_PLAN: Record<CalendarEntry['status'], PlanEntry['status']> = {
  ready: 'ready',
  'needs-thumbnail': 'needs-thumbnail',
  suggestion: 'suggested',
  'render-retry': 'render-retry',
  posted: 'posted',
};

/** The short agenda on Home: five days from `weekStart` (default today), empty days included. */
export async function planCalendar(brandId: string, weekStart?: string): Promise<PlanEntry[]> {
  void brandId;
  await wait(200);
  const start = weekStart ? parseDay(weekStart) : todayDate();
  const rows: PlanEntry[] = [];
  for (let i = 0; i < 5; i++) {
    const d = addDays(start, i);
    const day = !weekStart && i === 0 ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' });
    const list = calendar.filter((e) => e.date === iso(d)).sort(byTime);
    if (list.length === 0) rows.push({ id: `empty-${iso(d)}`, day, status: 'empty' });
    for (const e of list) rows.push({ id: e.id, day, channel: e.channel, title: e.title, status: STATUS_TO_PLAN[e.status] });
  }
  return clone(rows);
}

// ---- images ----

/** Credits an AI-generated image costs. Shown to the user before they confirm. */
export const AI_IMAGE_CREDITS = 20;

const imageStore: ImageItem[] = clone(imageFixtures);

export async function listImages(brandId: string): Promise<ImageItem[]> {
  void brandId;
  await wait(400);
  return clone([...imageStore].sort((a, b) => b.createdAt - a.createdAt));
}

function addImage(item: Omit<ImageItem, 'id' | 'createdAt'>): ImageItem {
  const created: ImageItem = {
    ...item,
    id: `im${Date.now()}`,
    createdAt: Math.max(0, ...imageStore.map((i) => i.createdAt)) + 1,
  };
  imageStore.push(created);
  return clone(created);
}

/** Adds an image the user already has. Same failure behaviour as uploadVideo. */
export async function uploadImage(
  brandId: string,
  file: { name: string; size: number },
  onProgress: (fraction: number) => void,
): Promise<ImageItem> {
  void brandId;
  const shouldFail = failNext.upload || /fail/i.test(file.name);
  failNext.upload = false;
  for (let i = 1; i <= 10; i++) {
    await wait(120);
    onProgress(i / 10);
    if (shouldFail && i === 5)
      throw new EngineError('UPLOAD_FAILED', 'The upload stopped at 50%. Nothing was lost, try again.');
  }
  return addImage({
    kind: 'image',
    title: file.name.replace(/\.[^.]+$/, '') || 'Image',
    ratio: '16:9',
    caption: '',
    poster: { from: '#E9DDD3', to: '#B7A294' },
    textTone: 'dark',
    status: 'draft',
    source: 'Uploaded by you',
  });
}

/** Creates a draft image from a template, a video frame, or an AI prompt (costs AI_IMAGE_CREDITS). */
export async function createImage(brandId: string, input: ImageStart): Promise<ImageItem> {
  void brandId;
  await wait(input.start === 'ai' ? 1800 : 700);
  if (input.start === 'ai') {
    if (failNext.image) {
      failNext.image = false;
      throw new EngineError('IMAGE_FAILED', 'We could not make that image. You were not charged, try again.');
    }
    return addImage({
      kind: 'image',
      title: input.prompt.trim().slice(0, 40) || 'AI image',
      ratio: '16:9',
      caption: '',
      poster: { from: '#2F3E4A', to: '#F2A39B' },
      textTone: 'light',
      status: 'draft',
      source: 'Made with AI on its own',
    });
  }
  if (input.start === 'frame') {
    const p = findProject(input.projectId);
    return addImage({
      kind: 'thumbnail',
      title: 'Thumbnail from a frame',
      ratio: '16:9',
      caption: p.title,
      poster: p.poster,
      textTone: 'light',
      status: 'draft',
      source: `From “${p.title}”`,
      projectId: p.id,
    });
  }
  const t = {
    thumbnail: { title: 'Thumbnail', ratio: '16:9' as const, caption: 'Your headline' },
    carousel: { title: 'Carousel · 5 slides', ratio: '4:5' as const, caption: 'Slide 1 of 5' },
    quote: { title: 'Quote card', ratio: '1:1' as const, caption: 'Your quote here' },
  }[input.kind];
  return addImage({
    ...t,
    kind: input.kind,
    poster: { from: '#2F3E4A', to: '#0F0F0F' },
    textTone: 'light',
    status: 'draft',
    source: 'Made on its own',
  });
}

// ---- assets ----

const assetStore: AssetItem[] = clone(assetFixtures);
/** When a freshly uploaded asset finishes "labelling". */
const lowResIds = new Set<string>();
const readyAt = new Map<string, number>(assetStore.filter((x) => x.status === 'processing').map((x) => [x.id, Date.now() + 5000]));

export const ASSET_TYPES = 'PNG, JPG, WebP, SVG, MP3 or WAV';

export async function listAssets(brandId: string): Promise<AssetItem[]> {
  void brandId;
  await wait(350);
  for (const item of assetStore) {
    const at = readyAt.get(item.id);
    if (item.status === 'processing' && at !== undefined && Date.now() >= at) {
      item.status = 'ready';
      item.note = lowResIds.has(item.id)
        ? { tone: 'warn', text: 'Low resolution' }
        : item.kind === 'music'
          ? { tone: 'plain', text: 'Music' }
          : { tone: 'ok', text: item.kind === 'logo' ? 'Transparent' : 'Cut out' };
      readyAt.delete(item.id);
    }
  }
  return clone([...assetStore].sort((a, b) => b.createdAt - a.createdAt));
}

/**
 * Adds one or more files. Unsupported files are returned in `rejected` rather than thrown, so the
 * good ones still go through. A dropped connection throws UPLOAD_FAILED and adds nothing.
 */
export async function uploadAssets(
  brandId: string,
  files: { name: string; size: number }[],
  onProgress: (fraction: number) => void,
): Promise<AssetUploadResult> {
  void brandId;
  const shouldFail = failNext.upload || files.some((f) => /fail/i.test(f.name));
  failNext.upload = false;
  for (let i = 1; i <= 10; i++) {
    await wait(120);
    onProgress(i / 10);
    if (shouldFail && i === 5)
      throw new EngineError('UPLOAD_FAILED', 'The upload stopped at 50%. Nothing was added, try again.');
  }
  const added: AssetItem[] = [];
  const rejected: AssetUploadResult['rejected'] = [];
  for (const f of files) {
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    const isAudio = ['mp3', 'wav'].includes(ext);
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext);
    if (!isAudio && !isImage) {
      rejected.push({ name: f.name, reason: `We can't use .${ext || 'that type of'} files. Use ${ASSET_TYPES}.` });
      continue;
    }
    const lower = f.name.toLowerCase();
    const kind: AssetKind = isAudio ? 'music' : ext === 'svg' || lower.includes('logo') ? 'logo' : /screen|shot/.test(lower) ? 'screenshot' : 'product';
    const item: AssetItem = {
      id: `as${Date.now()}${added.length}`,
      name: f.name.replace(/\.[^.]+$/, ''),
      kind,
      status: 'processing',
      note: { tone: 'progress', text: isAudio ? 'Listening…' : 'Labelling…' },
      poster: { from: '#E9DDD3', to: '#B7A294' },
      durationSec: isAudio ? 60 : undefined,
      usedIn: 0,
      createdAt: Math.max(0, ...assetStore.map((x) => x.createdAt)) + 1,
    };
    if (/lowres/i.test(lower)) lowResIds.add(item.id);
    assetStore.push(item);
    readyAt.set(item.id, Date.now() + 3000);
    added.push(item);
  }
  return clone({ added, rejected });
}

// ---- help ----

export async function listGuides(): Promise<{ topics: string[]; guides: Guide[] }> {
  await wait(250);
  return clone({ topics: helpFixtures.guideTopics, guides: helpFixtures.guides });
}

export async function listReleaseNotes(): Promise<ReleaseNote[]> {
  await wait(250);
  return helpFixtures.releaseNotes.map((n) => ({ id: n.id, date: dayOffset(-n.daysAgo), title: n.title, items: [...n.items] }));
}

export async function getSupportInfo(): Promise<SupportInfo> {
  await wait(150);
  return clone(helpFixtures.supportInfo);
}

let supportCount = 1041;

/**
 * Sends a message to the people behind the product. Invalid input throws INVALID_INPUT, a delivery
 * problem throws SUPPORT_FAILED; both say the message was not sent. Returns a reference to quote.
 */
export async function sendSupportMessage(req: SupportRequest): Promise<{ reference: string; replyTime: string }> {
  await wait(1000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.replyTo.trim()))
    throw new EngineError('INVALID_INPUT', 'That email does not look right. We need it to reply.', false);
  if (req.message.trim().length < 10)
    throw new EngineError('INVALID_INPUT', 'Tell us a little more so we can help, at least a sentence.', false);
  if (failNext.support) {
    failNext.support = false;
    throw new EngineError('SUPPORT_FAILED', 'We could not send that. Your message is still here, try again.');
  }
  supportCount += 1;
  return { reference: `HX-${supportCount}`, replyTime: helpFixtures.supportInfo.replyTime };
}

// ---- settings and billing ----

const creditsState = clone(fx.credits);
const PLANS: BillingPlan[] = [
  { id: 'free', name: 'Free', priceMonthly: 0, creditsPerMonth: 200, blurb: 'Try it on a few videos.' },
  { id: 'creator', name: 'Creator', priceMonthly: 29, creditsPerMonth: 2000, blurb: 'For one creator posting every week.' },
  { id: 'studio', name: 'Studio', priceMonthly: 79, creditsPerMonth: 8000, blurb: 'For agencies with several brands.' },
];
const PACKS: CreditPack[] = [
  { id: 'p500', credits: 500, price: 9 },
  { id: 'p2000', credits: 2000, price: 29 },
  { id: 'p5000', credits: 5000, price: 59 },
];
let currentPlanId = 'creator';
const nextMonth = () => {
  const d = todayDate();
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 1));
};

function billingState(): Billing {
  return clone({
    plan: PLANS.find((p) => p.id === currentPlanId)!,
    plans: PLANS,
    packs: PACKS,
    credits: creditsState,
    renewsOn: nextMonth(),
    paymentMethod: 'Visa ending 4242',
  });
}

export async function getBilling(): Promise<Billing> {
  await wait(350);
  return billingState();
}

/** Switches plan. Going to a plan that includes fewer credits than already used this month is refused (INVALID_INPUT). */
export async function changePlan(planId: string): Promise<Billing> {
  await wait(700);
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) throw new EngineError('NOT_FOUND', 'We do not have that plan.', false);
  if (failNext.payment && plan.priceMonthly > 0) {
    failNext.payment = false;
    throw new EngineError('PAYMENT_FAILED', 'Your card was declined. You were not charged and your plan has not changed.');
  }
  if (plan.creditsPerMonth < creditsState.used)
    throw new EngineError('INVALID_INPUT', `You have already used ${creditsState.used.toLocaleString('en-US')} credits this month, which is more than ${plan.name} includes. You can switch after ${parseDay(nextMonth()).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.`, false);
  currentPlanId = plan.id;
  creditsState.total = plan.creditsPerMonth;
  return billingState();
}

/** One-off credits on top of the plan. Charged to the saved payment method. */
export async function buyCredits(packId: string): Promise<Billing> {
  await wait(900);
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack) throw new EngineError('NOT_FOUND', 'We do not have that pack.', false);
  if (failNext.payment) {
    failNext.payment = false;
    throw new EngineError('PAYMENT_FAILED', 'Your card was declined. You were not charged and no credits were added.');
  }
  creditsState.total += pack.credits;
  return billingState();
}

/** What each action costs, so the price is known before anything runs. */
export async function listCosts(): Promise<CostItem[]> {
  await wait(150);
  return [
    { id: 'render', action: 'Make or re-render an edited video', credits: 40, note: 'Small changes preview first and only the changed part is charged.' },
    ...KIND_ORDER.map((k) => ({ id: k, action: MAKE_META[k].title, credits: MAKE_META[k].credits })),
    { id: 'image-ai', action: 'Generate an image with AI', credits: AI_IMAGE_CREDITS, note: 'Text is added separately, so it stays sharp.' },
    { id: 'upload', action: 'Upload videos, images, assets and music', credits: 0 },
  ];
}

export async function listAccounts(brandId: string): Promise<ConnectedAccount[]> {
  void brandId;
  await wait(250);
  return (['instagram', 'youtube'] as Platform[]).map((platform) => ({
    platform,
    name: platform === 'instagram' ? 'Instagram' : 'YouTube',
    connected: connectedAccounts[platform],
  }));
}

let exportDefaults: ExportDefaults = { aspect: '9:16', resolution: '1080p', burnCaptions: true };

export async function getExportDefaults(brandId: string): Promise<ExportDefaults> {
  void brandId;
  await wait(250);
  return clone(exportDefaults);
}

export async function updateExportDefaults(brandId: string, patch: Partial<ExportDefaults>): Promise<ExportDefaults> {
  void brandId;
  await wait(400);
  exportDefaults = { ...exportDefaults, ...patch };
  return clone(exportDefaults);
}

let deletionDate: string | undefined;

export async function getAccountStatus(): Promise<AccountStatus> {
  await wait(200);
  return { userName: fx.userName, deletionScheduledFor: deletionDate };
}

/** Starts a 30-day countdown. Nothing is removed until it ends, and the user can undo it. `confirm` must be DELETE. */
export async function requestAccountDeletion(confirm: string): Promise<AccountStatus> {
  await wait(800);
  if (confirm.trim() !== 'DELETE') throw new EngineError('INVALID_INPUT', 'Type DELETE in capital letters to confirm.', false);
  deletionDate = iso(addDays(todayDate(), 30));
  return { userName: fx.userName, deletionScheduledFor: deletionDate };
}

export async function cancelAccountDeletion(): Promise<AccountStatus> {
  await wait(400);
  deletionDate = undefined;
  return { userName: fx.userName };
}

/** Asks for a download of everything the user made. The link arrives by email. */
export async function requestDataExport(): Promise<{ message: string }> {
  await wait(700);
  return { message: 'We are packing your videos, images, posts and settings. We will email you a link within a day.' };
}

// ---- analytics ----

const connectedAccounts: Record<Platform, boolean> = { instagram: false, youtube: false };

function analyticsData(): AnalyticsData {
  const end = todayDate();
  const daily = analyticsFixtures.dailyViews.map((views, i) => ({
    date: iso(addDays(end, i - analyticsFixtures.dailyViews.length)),
    views,
  }));
  const peakDay = parseDay(daily[analyticsFixtures.peakIndex].date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const anyConnected = connectedAccounts.instagram || connectedAccounts.youtube;
  return clone({
    isExample: !anyConnected,
    connected: connectedAccounts,
    stats: analyticsFixtures.stats,
    daily,
    peak: `${peakDay}, “Three emails we stopped sending”`,
    insights: analyticsFixtures.insights,
    suggestions: analyticsFixtures.suggestions,
    posts: analyticsFixtures.posts,
  });
}

/** Numbers for the last 28 days. `isExample` is true until an account is connected. */
export async function getAnalytics(brandId: string): Promise<AnalyticsData> {
  void brandId;
  await wait(500);
  return analyticsData();
}

/** Starts the connection for a platform. The mock connects after a moment; a real one opens that platform's sign-in. */
export async function connectAccount(brandId: string, platform: Platform): Promise<AnalyticsData> {
  void brandId;
  await wait(1500);
  if (failNext.connect) {
    failNext.connect = false;
    throw new EngineError('CONNECT_FAILED', `We could not reach ${platform === 'instagram' ? 'Instagram' : 'YouTube'}. Nothing was connected, try again.`);
  }
  connectedAccounts[platform] = true;
  return analyticsData();
}

export async function disconnectAccount(brandId: string, platform: Platform): Promise<AnalyticsData> {
  void brandId;
  await wait(400);
  connectedAccounts[platform] = false;
  return analyticsData();
}

// ---- branding: brand kit and writing voice ----

const kitStore = new Map<string, BrandKit>([[brandKitFixture.brandId, clone(brandKitFixture)]]);
const voiceStore = new Map<string, VoiceProfile>([[voiceFixture.brandId, clone(voiceFixture)]]);

function kitOf(brandId: string): BrandKit {
  let k = kitStore.get(brandId);
  if (!k) {
    k = { ...clone(brandKitFixture), brandId, handle: '@newbrand', logo: { name: 'Brand logo', poster: { from: '#27272A', to: '#6D3BE8' } } };
    kitStore.set(brandId, k);
  }
  return k;
}
function voiceOf(brandId: string): VoiceProfile {
  let v = voiceStore.get(brandId);
  if (!v) {
    v = { ...clone(voiceFixture), brandId, samples: 0 };
    voiceStore.set(brandId, v);
  }
  return v;
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export async function getBrandKit(brandId: string): Promise<BrandKit> {
  await wait(300);
  return clone(kitOf(brandId));
}

export async function listFonts(): Promise<string[]> {
  await wait(100);
  return clone(fontList);
}

/**
 * Saves any of: colours, fonts, handle. Invalid values throw INVALID_INPUT with a plain message and
 * nothing is saved. Problems that do not block saving (low contrast) come back as `warnings`.
 */
export async function updateBrandKit(
  brandId: string,
  patch: { colors?: Partial<BrandColors>; fonts?: Partial<BrandKit['fonts']>; handle?: string },
): Promise<BrandKitSave> {
  await wait(450);
  const kit = kitOf(brandId);
  const next = clone(kit);
  for (const [name, value] of Object.entries(patch.colors ?? {})) {
    if (!/^#[0-9a-f]{6}$/i.test(value))
      throw new EngineError('INVALID_INPUT', `${name[0].toUpperCase()}${name.slice(1)} needs a colour like #1A2226.`, false);
    next.colors[name as keyof BrandColors] = value.toUpperCase();
  }
  for (const [role, font] of Object.entries(patch.fonts ?? {})) {
    if (font && !fontList.includes(font)) throw new EngineError('INVALID_INPUT', `We do not have the font ${font}.`, false);
    if (font) next.fonts[role as 'headline' | 'body'] = font;
  }
  if (patch.handle !== undefined) {
    const h = patch.handle.trim().replace(/^@?/, '');
    if (!/^[A-Za-z0-9_.]{1,30}$/.test(h))
      throw new EngineError('INVALID_INPUT', 'A handle can use letters, numbers, dots and underscores, up to 30.', false);
    next.handle = `@${h}`;
  }
  kitStore.set(brandId, next);
  const warnings: string[] = [];
  const textOn = contrast(next.colors.text, next.colors.background);
  if (textOn < 4.5)
    warnings.push(`Text on your background is hard to read (contrast ${textOn.toFixed(1)}:1, aim for 4.5:1 or more).`);
  const primaryOn = contrast(next.colors.primary, next.colors.background);
  if (primaryOn < 3)
    warnings.push(`Your primary colour is faint on your background (contrast ${primaryOn.toFixed(1)}:1), so buttons and highlights may be missed.`);
  return clone({ kit: next, warnings });
}

/** Same upload behaviour as uploadVideo. The new logo replaces the old one on carousels and quote cards. */
export async function replaceLogo(
  brandId: string,
  file: { name: string; size: number },
  onProgress: (fraction: number) => void,
): Promise<BrandKit> {
  const kit = kitOf(brandId);
  const shouldFail = failNext.upload || /fail/i.test(file.name);
  failNext.upload = false;
  for (let i = 1; i <= 10; i++) {
    await wait(100);
    onProgress(i / 10);
    if (shouldFail && i === 5)
      throw new EngineError('UPLOAD_FAILED', 'The upload stopped at 50%. Your old logo is still in place, try again.');
  }
  kit.logo = { name: file.name.replace(/\.[^.]+$/, ''), poster: { from: '#E9DDD3', to: '#8C7E80' } };
  return clone(kit);
}

export async function getVoice(brandId: string): Promise<VoiceProfile> {
  await wait(300);
  return clone(voiceOf(brandId));
}

export async function getVoiceOptions(): Promise<VoiceOptions> {
  await wait(100);
  return clone(voiceOptionsFixture);
}

/** Learns from one more past post. Too-short text is refused with INVALID_INPUT. */
export async function addVoiceSample(brandId: string, text: string): Promise<VoiceProfile> {
  await wait(900);
  if (text.trim().length < 120)
    throw new EngineError('INVALID_INPUT', 'That is a bit short for us to hear your voice. Paste a full post, at least a few sentences.', false);
  const v = voiceOf(brandId);
  v.samples += 1;
  return clone(v);
}

/** Saves edits to what we picked up. */
export async function updateVoice(
  brandId: string,
  patch: Partial<Pick<VoiceProfile, 'tone' | 'sentenceLength' | 'wordsUse' | 'wordsAvoid' | 'emoji'>>,
): Promise<VoiceProfile> {
  await wait(400);
  const v = voiceOf(brandId);
  if (patch.tone && patch.tone.length === 0)
    throw new EngineError('INVALID_INPUT', 'Pick at least one tone so we know how to sound.', false);
  Object.assign(v, patch);
  return clone(v);
}
