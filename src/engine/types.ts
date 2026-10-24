// Types shared between the UI and the engine. The real engine implements these same shapes.

export type ProjectStatus =
  | 'listening'
  | 'choose-style'
  | 'rendering'
  | 'render-failed'
  | 'thumbnail'
  | 'ready';

export interface Gradient {
  from: string;
  to: string;
}

export interface Project {
  id: string;
  brandId: string;
  title: string;
  durationSec: number;
  source: 'upload' | 'record';
  status: ProjectStatus;
  /** 1 to 5: Add, Style, Edit, Thumbnail, Post. */
  step: 1 | 2 | 3 | 4 | 5;
  stepLabel: string;
  /** Placeholder look until real frames exist. */
  poster: Gradient;
  resolution?: { width: number; height: number };
  updatedAt: string;
  /** 0 to 1, only while status is 'rendering'. */
  renderProgress?: number;
  madeFrom: { videos: number; thumbnails: number; posts: number };
}

export interface TranscriptLine {
  startSec: number;
  endSec: number;
  text: string;
}

export interface Shot {
  startSec: number;
  endSec: number;
  label: string;
  quality: 'ok' | 'soft';
}

export interface MediaCard {
  projectId: string;
  durationSec: number;
  language: string;
  transcript: TranscriptLine[];
  shots: Shot[];
}

/** Placeholder: the real edit plan is owned by the video engine. The UI only reads `revision`. */
export interface Plan {
  projectId: string;
  revision: number;
  data: Record<string, unknown>;
}

export interface PatchOp {
  path: string;
  value: unknown;
}

export interface Patch {
  label: string;
  ops: PatchOp[];
}

export type PatchResult =
  | { ok: true; plan: Plan }
  | { ok: false; reasons: string[] };

export type DirectionPreset = 'punchy' | 'calm' | 'cinematic';

export interface Direction {
  preset: DirectionPreset;
  /** 0 to 100 */
  intensity: number;
}

export interface DirectorNote {
  id: string;
  text: string;
  alternative: string;
}

export interface Check {
  id: string;
  label: string;
  severity: 'ok' | 'warn' | 'error';
  detail?: string;
  fixLabel?: string;
  /** What the fix button applies, through applyPatch. */
  fixPatch?: Patch;
}

export interface StyleSuggestion {
  id: string;
  name: string;
  description: string;
  preset: DirectionPreset;
}

export type RenderStatus = 'queued' | 'rendering' | 'done' | 'failed';

export interface RenderJob {
  id: string;
  projectId: string;
  status: RenderStatus;
  /** 0 to 1 */
  progress: number;
  error?: string;
}

export interface ThumbnailOption {
  id: string;
  label: string;
  headline?: string;
  poster: Gradient;
  phoneCheck: { ok: boolean; note: string };
  selected: boolean;
}

export type TextKind = 'clips' | 'linkedin' | 'x-thread' | 'carousel' | 'captions' | 'article';

export interface TextAsset {
  id: string;
  projectId: string;
  kind: TextKind;
  status: 'ready' | 'needs-review';
  title: string;
  body: string;
  parts?: string[];
}

export interface VideoStyle {
  id: string;
  name: string;
  description: string;
  origin: 'suggested' | 'mine';
  /** True when built from a reference video the user uploaded. */
  fromReference: boolean;
  poster: Gradient;
}

export interface DirectionState {
  direction: Direction;
  notes: DirectorNote[];
  checks: Check[];
  plan: Plan;
}

export interface HistoryEntry {
  revision: number;
  label: string;
  current: boolean;
}

export interface History {
  /** Newest first. */
  entries: HistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;
}

export interface TimelineBlock {
  /** Percent of the video length, 0 to 100. */
  left: number;
  width: number;
  tone: 'solid' | 'muted' | 'light' | 'marker';
}

export interface TimelineTrack {
  id: 'video' | 'camera' | 'captions' | 'assets' | 'audio';
  label: string;
  blocks: TimelineBlock[];
}

export interface Timeline {
  tracks: TimelineTrack[];
  previewCaption: string;
}

export interface InterpretedRequest {
  /** Plain-words restatement, shown as "Reading this as...". */
  reading: string;
  /** What the short preview covers, e.g. "0:10 to 0:20". */
  previewNote: string;
  patch: Patch;
}

export interface MakeMoreItem {
  kind: TextKind;
  title: string;
  description: string;
  status: 'not-made' | 'found' | 'ready' | 'needs-review';
  /** Short label next to the title, e.g. "2 found". */
  badge?: string;
  credits?: number;
}

export interface MadeItem {
  id: string;
  type: 'video' | 'thumbnail' | 'text';
  title: string;
  detail: string;
  status: 'ready' | 'needs-review';
  poster?: Gradient;
  kind?: TextKind;
  scheduled: boolean;
}

export type Platform = 'instagram' | 'youtube';

export interface Guide {
  id: string;
  title: string;
  summary: string;
  topic: string;
  steps: string[];
  /** Where "Go there" leads, an in-app path. */
  link: { label: string; to: string };
}

export interface ReleaseNote {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  items: string[];
}

export type SupportTopic = 'broken' | 'billing' | 'question' | 'idea';

export interface SupportInfo {
  /** Plain words, e.g. "within 1 working day". */
  replyTime: string;
  topics: { id: SupportTopic; label: string }[];
}

export interface SupportRequest {
  topic: SupportTopic;
  message: string;
  replyTo: string;
}

export interface BillingPlan {
  id: string;
  name: string;
  /** Whole currency units per month. */
  priceMonthly: number;
  creditsPerMonth: number;
  blurb: string;
}

export interface CreditPack {
  id: string;
  credits: number;
  price: number;
}

export interface Billing {
  plan: BillingPlan;
  plans: BillingPlan[];
  packs: CreditPack[];
  credits: { used: number; total: number };
  /** When credits reset and the plan renews, YYYY-MM-DD. */
  renewsOn: string;
  /** Plain words, never a full number. */
  paymentMethod: string;
}

export interface CostItem {
  id: string;
  action: string;
  credits: number;
  note?: string;
}

export interface ConnectedAccount {
  platform: Platform;
  name: string;
  connected: boolean;
}

export interface ExportDefaults {
  aspect: '9:16' | '1:1' | '16:9';
  resolution: '720p' | '1080p' | '4K';
  burnCaptions: boolean;
}

export interface AccountStatus {
  userName: string;
  /** Set while a deletion is scheduled and can still be undone, YYYY-MM-DD. */
  deletionScheduledFor?: string;
}

export interface AnalyticsStat {
  id: string;
  label: string;
  value: string;
  /** Plain words under the number, e.g. "+12% vs before". */
  detail: string;
}

export interface AnalyticsPost {
  id: string;
  title: string;
  projectId?: string;
  poster: Gradient;
  landscape: boolean;
  channel: Channel;
  views: number;
  /** 0 to 100. */
  watchedPercent: number;
  /** How we cut it, e.g. "Punchy", "question hook", "0:48". */
  edit: string[];
}

export interface AnalyticsSuggestion {
  id: string;
  text: string;
  actionLabel: string;
  /** Where the button goes. */
  target: 'calendar' | 'new-project';
}

export interface AnalyticsData {
  /** True until an account is connected: the numbers are an illustration, not the user's. */
  isExample: boolean;
  connected: Record<Platform, boolean>;
  stats: AnalyticsStat[];
  /** Views for the last 28 days, oldest first. */
  daily: { date: string; views: number }[];
  /** What the peak day was, in words. */
  peak: string;
  /** Early patterns, never claimed as proof. */
  insights: string[];
  suggestions: AnalyticsSuggestion[];
  posts: AnalyticsPost[];
}

export interface BrandColors {
  primary: string;
  text: string;
  background: string;
  highlight: string;
}

export interface BrandKit {
  brandId: string;
  /** Hex, #RRGGBB. */
  colors: BrandColors;
  fonts: { headline: string; body: string };
  logo: { name: string; poster: Gradient };
  /** Always starts with @. */
  handle: string;
}

export interface BrandKitSave {
  kit: BrandKit;
  /** Plain-words problems that do not block saving, e.g. low contrast. */
  warnings: string[];
}

export interface VoiceProfile {
  brandId: string;
  /** How many past posts we have learned from. */
  samples: number;
  tone: string[];
  /** 1 (short sentences) to 5 (long sentences). */
  sentenceLength: 1 | 2 | 3 | 4 | 5;
  wordsUse: string[];
  wordsAvoid: string[];
  emoji: 'None' | 'Occasional' | 'Often';
  /** The same point written two ways. */
  example: { generic: string; yours: string };
}

export interface VoiceOptions {
  tones: string[];
  emoji: VoiceProfile['emoji'][];
}

export type AssetKind = 'product' | 'logo' | 'screenshot' | 'music';

export interface AssetItem {
  id: string;
  name: string;
  kind: AssetKind;
  /** 'processing' while we label it and cut out the background. */
  status: 'processing' | 'ready';
  /** The one thing worth saying about it, in plain words. */
  note: { tone: 'ok' | 'warn' | 'progress' | 'plain'; text: string };
  poster: Gradient;
  /** Music only. */
  durationSec?: number;
  /** Videos and images it appears in. */
  usedIn: number;
  usedEverywhere?: boolean;
  createdAt: number;
}

export interface AssetUploadResult {
  added: AssetItem[];
  /** Files we cannot use, each with the reason in plain words. */
  rejected: { name: string; reason: string }[];
}

export type ImageKind = 'thumbnail' | 'carousel' | 'quote' | 'image';

export interface ImageItem {
  id: string;
  kind: ImageKind;
  title: string;
  /** Width:height shown as a small tag, e.g. "4:5". */
  ratio: '16:9' | '4:5' | '1:1' | '9:16';
  /** Text printed on the image, used as its placeholder look. */
  caption: string;
  poster: Gradient;
  textTone: 'light' | 'dark';
  status: 'ready' | 'needs-review' | 'draft';
  /** Plain words, e.g. "Readable on a phone" or "1 number to confirm". */
  note?: { ok: boolean; text: string };
  /** Where it came from, e.g. "From “Pricing page teardown”" or "Made on its own". */
  source: string;
  projectId?: string;
  createdAt: number;
}

export type ImageStart =
  | { start: 'template'; kind: Exclude<ImageKind, 'image'> }
  | { start: 'frame'; projectId: string }
  | { start: 'ai'; prompt: string };

export interface UploadResult {
  project: Project;
  warnings: string[];
}

// ---- Account and Home ----

export interface Brand {
  id: string;
  name: string;
  initials: string;
}

export interface Session {
  userName: string;
  brands: Brand[];
  credits: { used: number; total: number };
}

export interface TodoItem {
  id: string;
  kind: 'choose-style' | 'approve-thumbnail' | 'retry-render';
  title: string;
  detail: string;
  projectId: string;
  severity: 'warn' | 'error';
  actionLabel: string;
}

export type Channel = 'LinkedIn' | 'Instagram' | 'X' | 'YouTube Shorts';

export type CalendarStatus = 'ready' | 'needs-thumbnail' | 'render-retry' | 'suggestion' | 'posted';

/** One planned post. We never post for the user; "ready" means ready for them to copy and post. */
export interface CalendarEntry {
  id: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Local time, HH:MM. */
  time: string;
  channel: Channel;
  title: string;
  status: CalendarStatus;
  projectId?: string;
  text?: string;
  image?: Gradient;
  imageLabel?: string;
}

/** Made but not yet given a day. */
export interface UnscheduledItem {
  id: string;
  label: string;
  channel: Channel;
  projectId?: string;
  text?: string;
  image?: Gradient;
}

export interface CalendarData {
  entries: CalendarEntry[];
  unscheduled: UnscheduledItem[];
  /** The goal the plan was last built for. */
  goal: string;
}

export interface PlanEntry {
  id: string;
  day: string;
  channel?: Channel;
  title?: string;
  /** 'empty' = nothing planned that day; 'suggested' = an idea the user can add. */
  status: 'ready' | 'needs-thumbnail' | 'empty' | 'suggested' | 'render-retry' | 'posted';
}

export interface TrendCard {
  id: string;
  kind: 'Format' | 'Topic' | 'Hook';
  title: string;
  summary: string;
  source: string;
  /** Only set when the source has an image. The UI shows no image area otherwise. */
  image?: Gradient;
}

export interface Idea {
  id: string;
  title: string;
  detail: string;
}

export interface HomeData {
  todo: TodoItem[];
  week: PlanEntry[];
  recent: Project[];
  trends: TrendCard[];
  ideas: Idea[];
}

export type EngineErrorCode = 'UPLOAD_FAILED' | 'RENDER_FAILED' | 'TEXT_FAILED' | 'IMAGE_FAILED' | 'INVALID_DATE' | 'INVALID_INPUT' | 'CONNECT_FAILED' | 'PAYMENT_FAILED' | 'SUPPORT_FAILED' | 'NOT_FOUND' | 'UNKNOWN';

export class EngineError extends Error {
  code: EngineErrorCode;
  retryable: boolean;
  constructor(code: EngineErrorCode, message: string, retryable = true) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.retryable = retryable;
  }
}
