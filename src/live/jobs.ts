// The live record of a long job (style from references, one-shot carousel, thumbnail): its stages, how long each took, the pictures so far and what
// the reader decided. The Live view draws it while the job runs; the last few are kept in this browser so Results can show them again.
// Reference pictures are held in memory only: what is saved has the replicas and the numbers, never a reference.
import { useSyncExternalStore } from 'react';

export type JobKind = 'style-from-references' | 'one-shot-carousel' | 'thumbnail';
export const JOB_LABEL: Record<JobKind, string> = { 'style-from-references': 'Style from references', 'one-shot-carousel': 'One-shot carousel', thumbnail: 'Thumbnail' };
export type StageStatus = 'waiting' | 'running' | 'done' | 'skipped' | 'failed';

export interface Stage {
  id: string;
  label: string;
  status: StageStatus;
  /** Wall-clock start, while running or after. */
  startedAt?: number;
  seconds?: number;
  /** A plain sentence: why it was skipped, what failed, "from cache"... */
  note?: string;
}
export type Source = 'MEASURED' | 'READER' | 'CLAMPED' | 'REJECTED';
export interface Decision {
  text: string;
  source: Source;
  /** Why a value was moved or turned down. */
  why?: string;
}
export interface LiveRound {
  n: number;
  label: string;
  /** A small picture of the replica (a JPEG data URL). */
  thumb: string;
  /** The picture of every pair in this round, for the big view. */
  big: string[];
  measuredPct: number;
  readerScore: number | null;
  score: number;
  decisions: Decision[];
  kept?: boolean;
  /** The first draft from measured numbers alone. */
  draft?: boolean;
}
export interface Job {
  id: string;
  kind: JobKind;
  title: string;
  startedAt: number;
  endedAt?: number;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  stages: Stage[];
  /** The references, in memory only (never saved). */
  references: { name: string; url: string }[];
  rounds: LiveRound[];
  /** What the job is waiting on right now, and since when. */
  waiting?: { label: string; since: number };
  /** Said in the panel: how many reader calls run at once, and that the loop's own calls cannot. */
  note?: string;
  cached?: boolean;
  message?: string;
  /** A finished plan, for Replay. */
  hasPlan?: boolean;
}

let current: Job | null = null;
let history: Job[] = [];
const subs = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  subs.forEach((f) => f());
};

export const jobNow = () => current;
export const jobHistory = () => history;
export const subscribeJobs = (f: () => void) => (subs.add(f), () => void subs.delete(f));
/** React: the job on screen (running, or the last one), re-read whenever it changes. */
export function useJob(): Job | null {
  useSyncExternalStore(subscribeJobs, () => version);
  return current;
}
export function useJobHistory(): Job[] {
  useSyncExternalStore(subscribeJobs, () => version);
  return history;
}

export interface JobHandle {
  readonly id: string;
  begin(id: string, label?: string): void;
  end(id: string, note?: string): void;
  skip(id: string, why: string): void;
  fail(id: string, why: string): void;
  /** Adds a stage (one per round) if it is not there yet. */
  ensure(id: string, label: string): void;
  references(r: { name: string; url: string }[]): void;
  round(r: LiveRound): void;
  keep(n: number): void;
  waiting(label: string | null): void;
  note(text: string): void;
  cached(): void;
  finish(status: 'done' | 'failed' | 'cancelled', message?: string): void;
  plan(): void;
  /** A stage that was done before the job started (splitting and measuring happen when the pictures are added): its seconds and a note. */
  preDone(id: string, seconds: number, note?: string): void;
  /** The seconds of a stage, for the timing log. */
  seconds(id: string): number;
}

const secs = (a: number) => Math.round(((performance.now() - a) / 1000) * 10) / 10;

/** Starts a job. Whatever job was on screen goes to the history. */
export function startJob(kind: JobKind, title: string, stages: { id: string; label: string }[]): JobHandle {
  if (current && current.status === 'running') current = { ...current, status: 'cancelled', endedAt: Date.now(), message: 'Replaced by a newer job.' };
  if (current) pushHistory(current);
  const id = `${kind}-${Date.now().toString(36)}`;
  const marks = new Map<string, number>();
  current = { id, kind, title, startedAt: Date.now(), status: 'running', stages: stages.map((s) => ({ ...s, status: 'waiting' as StageStatus })), references: [], rounds: [] };
  emit();
  const mine = () => current!.id === id;
  const patch = (f: (j: Job) => Job) => {
    if (!mine()) return;
    current = f(current!);
    emit();
  };
  const upStage = (sid: string, f: (s: Stage) => Stage) => patch((j) => ({ ...j, stages: j.stages.map((s) => (s.id === sid ? f(s) : s)) }));
  return {
    id,
    begin: (sid, label) => {
      marks.set(sid, performance.now());
      if (!current!.stages.some((s) => s.id === sid)) patch((j) => ({ ...j, stages: [...j.stages, { id: sid, label: label ?? sid, status: 'waiting' }] }));
      upStage(sid, (s) => ({ ...s, label: label ?? s.label, status: 'running', startedAt: Date.now() }));
    },
    end: (sid, note) => upStage(sid, (s) => ({ ...s, status: 'done', seconds: marks.has(sid) ? secs(marks.get(sid)!) : s.seconds, ...(note ? { note } : {}) })),
    skip: (sid, why) => upStage(sid, (s) => ({ ...s, status: 'skipped', note: why })),
    fail: (sid, why) => upStage(sid, (s) => ({ ...s, status: 'failed', note: why, seconds: marks.has(sid) ? secs(marks.get(sid)!) : s.seconds })),
    ensure: (sid, label) => {
      if (!current!.stages.some((s) => s.id === sid)) patch((j) => ({ ...j, stages: [...j.stages, { id: sid, label, status: 'waiting' }] }));
    },
    references: (r) => patch((j) => ({ ...j, references: r })),
    round: (r) => patch((j) => ({ ...j, rounds: j.rounds.some((x) => x.n === r.n && !!x.draft === !!r.draft) ? j.rounds.map((x) => (x.n === r.n && !!x.draft === !!r.draft ? r : x)) : [...j.rounds, r] })),
    keep: (n) => patch((j) => ({ ...j, rounds: j.rounds.map((r) => ({ ...r, kept: !r.draft && r.n === n })) })),
    waiting: (label) => patch((j) => ({ ...j, waiting: label ? { label, since: Date.now() } : undefined })),
    note: (text) => patch((j) => ({ ...j, note: text })),
    cached: () => patch((j) => ({ ...j, cached: true })),
    plan: () => patch((j) => ({ ...j, hasPlan: true })),
    finish: (status, message) => {
      if (!mine()) return;
      // Anything still waiting or running when the job ends is said to be skipped or failed, never left spinning.
      current = { ...current!, status, endedAt: Date.now(), waiting: undefined, ...(message ? { message } : {}), stages: current!.stages.map((s) => (s.status === 'running' ? { ...s, status: status === 'done' ? 'done' : 'failed', seconds: marks.has(s.id) ? secs(marks.get(s.id)!) : s.seconds } : s.status === 'waiting' ? { ...s, status: 'skipped', note: s.note ?? (status === 'done' ? 'not needed' : 'the job stopped before this') } : s)) };
      emit();
      void save(current);
    },
    preDone: (sid, seconds, note) => upStage(sid, (st) => ({ ...st, status: 'done', seconds, ...(note ? { note } : {}) })),
    seconds: (sid) => current?.stages.find((s) => s.id === sid)?.seconds ?? 0,
  };
}

// ----- keeping the last few in this browser -----
const DB = 'creator-live-jobs';
const KEEP = 6;
function pushHistory(j: Job) {
  history = [j, ...history.filter((x) => x.id !== j.id)].slice(0, KEEP);
}
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('jobs', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
/** What is saved: no reference pictures, only the replicas, the stages and the numbers. */
const forSaving = (j: Job): Job => ({ ...j, references: j.references.map((r) => ({ name: r.name, url: '' })) });
async function save(j: Job) {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('jobs', 'readwrite');
      tx.objectStore('jobs').put(forSaving(j));
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    const all = await loadSaved();
    if (all.length > KEEP) {
      const db2 = await open();
      const tx = db2.transaction('jobs', 'readwrite');
      for (const old of all.slice(KEEP)) tx.objectStore('jobs').delete(old.id);
    }
  } catch {
    /* storage may be off: the job is still in memory */
  }
}
/** The jobs kept in this browser, newest first. */
export async function loadSaved(): Promise<Job[]> {
  try {
    const db = await open();
    const all = await new Promise<Job[]>((res, rej) => {
      const q = db.transaction('jobs').objectStore('jobs').getAll();
      q.onsuccess = () => res(q.result as Job[]);
      q.onerror = () => rej(q.error);
    });
    return all.sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [];
  }
}
export async function clearSaved() {
  try {
    const db = await open();
    db.transaction('jobs', 'readwrite').objectStore('jobs').clear();
  } catch {
    /* nothing to clear */
  }
}

/** Stage seconds and their share of the whole, for the timing table. */
export function timingTable(j: Job): { stage: string; seconds: number; share: number }[] {
  const total = j.stages.reduce((a, s) => a + (s.seconds ?? 0), 0) || 1;
  return j.stages.filter((s) => s.seconds !== undefined).map((s) => ({ stage: s.label, seconds: s.seconds!, share: Math.round(((s.seconds ?? 0) / total) * 100) }));
}

// For tests and the Results screen: the same data, read from the page.
if (typeof window !== 'undefined') (window as unknown as { __liveJobs: unknown }).__liveJobs = { now: () => current, history: () => history, saved: loadSaved, clear: clearSaved, table: timingTable };

// ----- cancelling -----
const cancellers = new Map<string, () => void>();
/** The code that runs a job says how to stop it cleanly; the Cancel button in the Live view calls it. */
export function onCancel(jobId: string, f: () => void) {
  cancellers.set(jobId, f);
}
export function cancelJob() {
  if (current && current.status === 'running') cancellers.get(current.id)?.();
}
