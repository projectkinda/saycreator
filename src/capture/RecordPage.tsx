import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../useDocumentTitle';
import { bestMimeType, requestMedia, sampleBrightness, stopStream } from './media';
import { beatsFromText, beatsFromWriterJson } from './script';
import { assembleRecording, completeSession, findRecovery, saveChunk, startSession } from './storage';
import type { CaptureBeat, CaptureGap, CaptureManifest, CaptureTake, MicStats, RecoverySession } from './types';

type Phase = 'setup' | 'ready' | 'recording' | 'paused' | 'review' | 'saved';
const CAMERA_KEY = 'creator.capture.cameraOn';
const DEVICE_KEY = 'creator.capture.devices';
const supported = () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && !!window.indexedDB;
const fmt = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export default function RecordPage() {
  useDocumentTitle('Record');
  const [phase, setPhase] = useState<Phase>('setup');
  const [cameraOn, setCameraOn] = useState(() => localStorage.getItem(CAMERA_KEY) !== 'false');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const savedDevices = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? '{}') as { cameraId?: string; microphoneId?: string };
  const [cameraId, setCameraId] = useState(savedDevices.cameraId ?? '');
  const [microphoneId, setMicrophoneId] = useState(savedDevices.microphoneId ?? '');
  const [error, setError] = useState('');
  const [guide, setGuide] = useState(true);
  const [mic, setMic] = useState(0);
  const [noise, setNoise] = useState(0);
  const [storageRemaining, setStorageRemaining] = useState<number>();
  const [brightness, setBrightness] = useState<number>();
  const [elapsed, setElapsed] = useState(0);
  const [scriptInput, setScriptInput] = useState('');
  const [beats, setBeats] = useState<CaptureBeat[]>([]);
  const [beatIndex, setBeatIndex] = useState(0);
  const [takes, setTakes] = useState<CaptureTake[]>([]);
  const [gaps, setGaps] = useState<CaptureGap[]>([]);
  const [recovery, setRecovery] = useState<RecoverySession>();
  const [downloadUrl, setDownloadUrl] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const sessionRef = useRef('');
  const startedRef = useRef(0);
  const chunkRef = useRef(0);
  const beatStartRef = useRef(0);
  const levelsRef = useRef<number[]>([]);
  const analyserCleanup = useRef<(() => void) | undefined>(undefined);

  useEffect(() => { findRecovery().then(setRecovery).catch(() => undefined); }, []);
  useEffect(() => () => { stopStream(streamRef.current); analyserCleanup.current?.(); if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);

  const attachLevelMeter = useCallback((stream: MediaStream) => {
    analyserCleanup.current?.();
    const context = new AudioContext();
    const analyser = context.createAnalyser(); analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const values = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(values);
      const rms = Math.sqrt(values.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / values.length);
      setMic(rms); levelsRef.current.push(rms); if (levelsRef.current.length > 600) levelsRef.current.shift();
      frame = requestAnimationFrame(tick);
    };
    tick();
    analyserCleanup.current = () => { cancelAnimationFrame(frame); void context.close(); };
  }, []);

  const connect = useCallback(async (nextCameraOn = cameraOn, nextCameraId = cameraId, nextMicrophoneId = microphoneId) => {
    setError('');
    try {
      stopStream(streamRef.current);
      const stream = await requestMedia(nextCameraId || undefined, nextMicrophoneId || undefined, nextCameraOn);
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      attachLevelMeter(stream);
      const listed = await navigator.mediaDevices.enumerateDevices(); setDevices(listed);
      const estimate = await navigator.storage.estimate();
      if (estimate.quota !== undefined && estimate.usage !== undefined) setStorageRemaining(estimate.quota - estimate.usage);
      const videoTrack = stream.getVideoTracks()[0]; const audioTrack = stream.getAudioTracks()[0];
      const nextCamera = videoTrack?.getSettings().deviceId ?? cameraId; const nextMic = audioTrack?.getSettings().deviceId ?? microphoneId;
      setCameraId(nextCamera ?? ''); setMicrophoneId(nextMic ?? '');
      localStorage.setItem(DEVICE_KEY, JSON.stringify({ cameraId: nextCamera, microphoneId: nextMic }));
      setPhase('ready');
    } catch (cause) {
      const denied = cause instanceof DOMException && (cause.name === 'NotAllowedError' || cause.name === 'SecurityError');
      setError(denied ? 'Camera or microphone access was blocked. Use the lock icon beside the address, allow access, then reload this page.' : 'We could not start your camera or microphone. Check that another app is not using it, then try again.');
    }
  }, [attachLevelMeter, cameraId, cameraOn, microphoneId]);

  const changeCamera = async () => {
    const next = !cameraOn; setCameraOn(next); localStorage.setItem(CAMERA_KEY, String(next));
    if (phase !== 'setup') await connect(next);
  };

  useEffect(() => {
    if (phase !== 'ready') return;
    const timer = window.setInterval(() => {
      if (videoRef.current && cameraOn) setBrightness(sampleBrightness(videoRef.current));
      const recent = levelsRef.current.slice(-60); if (recent.length) setNoise([...recent].sort((a, b) => a - b)[Math.floor(recent.length * .2)] ?? 0);
    }, 1000);
    return () => clearInterval(timer);
  }, [cameraOn, phase]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = window.setInterval(() => setElapsed(performance.now() - startedRef.current), 250);
    return () => clearInterval(timer);
  }, [phase]);

  const importScript = () => {
    try { setBeats(scriptInput.trim().startsWith('{') ? beatsFromWriterJson(scriptInput) : beatsFromText(scriptInput)); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'That script could not be read.'); }
  };

  const startRecording = async () => {
    if (!streamRef.current) return;
    const sessionId = crypto.randomUUID(); const mimeType = bestMimeType(cameraOn);
    sessionRef.current = sessionId; chunkRef.current = 0; startedRef.current = performance.now(); beatStartRef.current = 0;
    await startSession({ sessionId, createdAt: new Date().toISOString(), mimeType, cameraOn, complete: false, chunks: 0 });
    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType, videoBitsPerSecond: cameraOn ? 6_000_000 : undefined, audioBitsPerSecond: 128_000 } : undefined);
    recorder.ondataavailable = (event) => { if (event.data.size) void saveChunk(sessionId, chunkRef.current++, event.data); };
    recorderRef.current = recorder; recorder.start(1500); setElapsed(0); setPhase('recording');
  };

  const markBeat = (direction: 1 | -1) => {
    const now = performance.now() - startedRef.current; const beat = beats[beatIndex];
    if (direction === 1 && beat) {
      setTakes((old) => [...old, { id: crypto.randomUUID(), beatId: beat.id, startedAtMs: beatStartRef.current, endedAtMs: now, mediaRef: `capture://${sessionRef.current}`, accepted: false }]);
      if (beatIndex < beats.length - 1) setGaps((old) => [...old, { afterBeatId: beat.id, startMs: now, endMs: now }]);
      beatStartRef.current = now; setBeatIndex((i) => Math.min(i + 1, beats.length - 1));
    } else if (direction === -1) setBeatIndex((i) => Math.max(0, i - 1));
  };

  const retake = () => {
    const beat = beats[beatIndex]; if (!beat) return;
    setTakes((old) => old.map((take) => take.beatId === beat.id ? { ...take, accepted: false } : take)); beatStartRef.current = performance.now() - startedRef.current;
  };

  const stop = async () => {
    const recorder = recorderRef.current; if (!recorder) return;
    const stopped = new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true })); recorder.stop(); await stopped;
    const blob = await assembleRecording(sessionRef.current, recorder.mimeType);
    setDownloadUrl(URL.createObjectURL(blob)); setPhase('review');
  };

  const acceptTake = (id: string) => setTakes((old) => old.map((take) => take.beatId === old.find((candidate) => candidate.id === id)?.beatId ? { ...take, accepted: take.id === id } : take));

  const save = async () => {
    const stream = streamRef.current; const video = stream?.getVideoTracks()[0]; const audio = stream?.getAudioTracks()[0]; const settings = video?.getSettings() ?? {};
    const values = levelsRef.current; const micStats: MicStats = { average: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length), peak: Math.max(0, ...values), noiseFloor: noise };
    const mediaRef = `indexeddb://${sessionRef.current}/chunks`; const manifest: CaptureManifest = {
      version: 1, sessionId: sessionRef.current, source: 'laptop', createdAt: new Date().toISOString(),
      device: { cameraId: settings.deviceId, cameraLabel: video?.label, microphoneId: audio?.getSettings().deviceId ?? '', microphoneLabel: audio?.label },
      video: { enabled: cameraOn, width: settings.width, height: settings.height, fps: settings.frameRate, codec: recorderRef.current?.mimeType ?? '', fileRef: cameraOn ? mediaRef : undefined },
      audio: { fileRef: mediaRef, codec: recorderRef.current?.mimeType ?? '' }, durationMs: elapsed, micStats,
      beats: beats.map((beat) => ({ ...beat, takes: takes.filter((take) => take.beatId === beat.id) })), gaps,
    };
    await completeSession(sessionRef.current, manifest); setPhase('saved');
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.code === 'Space' && phase === 'recording' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); markBeat(1); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  if (!supported()) return <div className="page"><h1 className="page-title">Record</h1><div className="card capture-message"><strong>Recording is not available in this browser.</strong><p>Use current Chrome or Edge on localhost or HTTPS. Camera and microphone access require a secure context.</p><Link to="/videos">Back to Videos</Link></div></div>;

  return <div className="page capture-page">
    <header className="page-header"><div><Link to="/videos" className="small">← Videos</Link><h1 className="page-title">Record</h1><p className="muted">Your camera, microphone, and takes stay on this device.</p></div><span className="chip">Laptop capture</span></header>
    {recovery && <div className="notice notice-warn" role="alert"><strong>Unfinished recording found</strong><span>{recovery.chunks} saved chunk{recovery.chunks === 1 ? '' : 's'} can be recovered.</span><button className="btn btn-outline btn-sm" onClick={async () => { const blob = await assembleRecording(recovery.sessionId, recovery.mimeType); sessionRef.current = recovery.sessionId; setDownloadUrl(URL.createObjectURL(blob)); setRecovery(undefined); setPhase('review'); }}>Recover recording</button></div>}
    {error && <div className="notice notice-error" role="alert"><strong>Access needed</strong><span>{error}</span></div>}
    <div className="capture-grid">
      <section className="capture-stage card">
        <video ref={videoRef} muted playsInline className={cameraOn ? '' : 'is-off'} aria-label="Camera preview" />
        {!cameraOn && <div className="camera-off">Camera off · audio only</div>}
        {guide && cameraOn && <div className="framing-guide" aria-label="Framing guide"><i/><i/><i/><i/><b/></div>}
        {phase === 'recording' && beats.length > 0 && <div className="karaoke"><div>{beats[beatIndex - 1]?.text}</div><strong>{beats[beatIndex]?.text}</strong>{beats[beatIndex]?.cue && <span className="chip">{beats[beatIndex].cue}</span>}<div>{beats[beatIndex + 1]?.text}</div></div>}
        <div className="capture-timer" aria-live="polite">{phase === 'recording' || phase === 'paused' ? fmt(elapsed) : ''}</div>
      </section>
      <aside className="capture-controls card">
        {phase === 'setup' && <><h2>Allow camera and microphone</h2><p>We need the microphone to record. The camera is optional. Your browser will ask for permission.</p><button className="btn btn-primary" onClick={() => void connect()}>Choose devices</button></>}
        {phase !== 'setup' && <>
          <label>Camera<select value={cameraId} disabled={!cameraOn || phase === 'recording'} onChange={(e) => { const id = e.target.value; setCameraId(id); void connect(cameraOn, id, microphoneId); }}><option value="">Default camera</option>{devices.filter((d) => d.kind === 'videoinput').map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}</select></label>
          <label>Microphone<select value={microphoneId} disabled={phase === 'recording'} onChange={(e) => { const id = e.target.value; setMicrophoneId(id); void connect(cameraOn, cameraId, id); }}><option value="">Default microphone</option>{devices.filter((d) => d.kind === 'audioinput').map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}</select></label>
          <button className="btn btn-outline" disabled={phase === 'recording'} onClick={() => void changeCamera()}>{cameraOn ? 'Turn camera off' : 'Turn camera on'}</button>
          <label className="capture-toggle"><input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)}/> Show thirds and 9:16 safe area</label>
          <div className="meter-row"><span>Mic level</span><meter min={0} max={0.6} low={0.04} high={0.45} optimum={0.2} value={mic}/><span>{mic < .025 ? 'Too low' : mic > .5 ? 'Clipping' : 'Good'}</span></div>
          <ul className="capture-checks"><li>{!cameraOn ? 'Audio-only' : brightness === undefined ? 'Checking light…' : brightness < .18 ? 'Too dark' : brightness > .88 ? 'Too bright' : 'Light looks usable'}</li><li>{noise > .08 ? 'Background noise is high' : 'Background noise looks low'}</li><li>{storageRemaining === undefined ? 'Storage estimate unavailable' : storageRemaining < 500_000_000 ? 'Storage is running low' : `${Math.round(storageRemaining / 1_000_000_000)} GB available`}</li></ul>
        </>}
      </aside>
    </div>
    <section className="card capture-script"><h2>Guided script</h2><p className="muted">Separate beats with blank lines. Long paragraphs split at sentences. Writer JSON may use <code>{'{ beats: [{ text, cue, note }] }'}</code>.</p>
      <textarea value={scriptInput} onChange={(e) => setScriptInput(e.target.value)} placeholder="Paste your script…" disabled={phase === 'recording'} />
      <div className="capture-actions"><button className="btn btn-outline" onClick={importScript} disabled={phase === 'recording'}>Make beats</button>{beats.length > 0 && <span>{beats.length} beats · beat {beatIndex + 1}</span>}</div>
      {beats.map((beat, index) => <div className="beat-edit" key={beat.id}><span>{index + 1}</span><input aria-label={`Beat ${index + 1}`} value={beat.text} disabled={phase === 'recording'} onChange={(e) => setBeats((old) => old.map((b) => b.id === beat.id ? { ...b, text: e.target.value } : b))}/><input aria-label={`Cue ${index + 1}`} placeholder="cue" value={beat.cue ?? ''} disabled={phase === 'recording'} onChange={(e) => setBeats((old) => old.map((b) => b.id === beat.id ? { ...b, cue: e.target.value } : b))}/></div>)}
    </section>
    <div className="capture-actions sticky-actions">
      {phase === 'ready' && <button className="btn btn-primary btn-lg" onClick={() => void startRecording()}>Start recording</button>}
      {(phase === 'recording' || phase === 'paused') && <><button className="btn btn-outline" onClick={() => { if (phase === 'recording') { recorderRef.current?.pause(); setPhase('paused'); } else { recorderRef.current?.resume(); startedRef.current += performance.now() - (startedRef.current + elapsed); setPhase('recording'); } }}>{phase === 'recording' ? 'Pause' : 'Resume'}</button><button className="btn btn-outline" onClick={() => markBeat(-1)}>Back one beat</button><button className="btn btn-outline" onClick={retake}>Retake this beat</button><button className="btn btn-primary" onClick={() => markBeat(1)}>Done with this beat</button><button className="btn btn-danger" onClick={() => void stop()}>Stop</button></>}
      {phase === 'review' && <><a className="btn btn-outline" href={downloadUrl} download={`take-${sessionRef.current || recovery?.sessionId}.webm`}>Play or download recording</a><button className="btn btn-primary" onClick={() => void save()}>Save accepted takes</button></>}
      {phase === 'saved' && <><strong>Recording and manifest saved on this device.</strong><Link className="btn btn-primary" to="/videos">Back to Videos</Link></>}
    </div>
    {phase === 'review' && beats.length > 0 && <section className="card capture-review"><h2>Review takes</h2>{beats.map((beat) => <div key={beat.id}><strong>{beat.text}</strong>{takes.filter((take) => take.beatId === beat.id).map((take, index) => <button key={take.id} className="btn btn-outline btn-sm" onClick={() => acceptTake(take.id)}>{take.accepted ? '✓ ' : ''}Take {index + 1} ({fmt(take.endedAtMs - take.startedAtMs)})</button>)}</div>)}</section>}
  </div>;
}
