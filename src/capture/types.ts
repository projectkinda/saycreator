export type CaptureBeat = { id: string; text: string; cue?: string; note?: string };
export type CaptureTake = {
  id: string;
  beatId: string;
  startedAtMs: number;
  endedAtMs: number;
  mediaRef: string;
  accepted: boolean;
};
export type CaptureGap = { afterBeatId: string; startMs: number; endMs: number };
export type MicStats = { average: number; peak: number; noiseFloor: number };

export type CaptureManifest = {
  version: 1;
  sessionId: string;
  source: 'laptop';
  createdAt: string;
  device: { cameraId?: string; cameraLabel?: string; microphoneId: string; microphoneLabel?: string };
  video: { enabled: boolean; width?: number; height?: number; fps?: number; codec: string; fileRef?: string };
  audio: { fileRef: string; codec: string };
  durationMs: number;
  micStats: MicStats;
  beats: Array<CaptureBeat & { takes: CaptureTake[] }>;
  gaps: CaptureGap[];
};

export type RecoverySession = {
  sessionId: string;
  createdAt: string;
  mimeType: string;
  cameraOn: boolean;
  complete: boolean;
  chunks: number;
};
