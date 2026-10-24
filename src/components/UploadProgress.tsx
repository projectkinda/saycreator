import { useRef, useState } from 'react';
import { Icon } from './Icon';

/**
 * File picker + progress + failure/retry, shared by "Upload a video" and "Upload a reference video".
 * `run` does the work through the engine and rejects with an Error whose message is shown to the user.
 */
export function UploadProgress({
  label,
  hint,
  accept = 'video/*',
  buttonClass = 'btn btn-outline btn-lg',
  run,
  onDone,
}: {
  label: string;
  hint?: string;
  accept?: string;
  buttonClass?: string;
  run: (file: File, onProgress: (f: number) => void) => Promise<string[] | void>;
  onDone?: (warnings: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<'idle' | 'working' | 'failed' | 'done'>('idle');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  const start = (f: File) => {
    setFile(f);
    setState('working');
    setProgress(0);
    setError('');
    run(f, setProgress)
      .then((w) => {
        setWarnings(w ?? []);
        setState('done');
        onDone?.(w ?? []);
      })
      .catch((e: Error) => {
        setError(e.message || 'The upload did not finish. Try again.');
        setState('failed');
      });
  };

  return (
    <div className="upload">
      <input
        ref={input}
        type="file"
        accept={accept}
        className="visually-hidden"
        aria-label={label}
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) start(f);
        }}
      />
      {(state === 'idle' || state === 'done') && (
        <button type="button" className={buttonClass} onClick={() => input.current?.click()}>
          <Icon name="upload" size={18} strokeWidth={2.2} />
          {label}
        </button>
      )}
      {state === 'idle' && hint && <p className="small muted">{hint}</p>}

      {state === 'working' && file && (
        <div className="upload-status" role="status">
          <div className="small">
            <strong>{file.name}</strong> · {Math.round(progress * 100)}%
          </div>
          <div
            className="bar"
            role="progressbar"
            aria-label={`Uploading ${file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {state === 'failed' && file && (
        <div className="notice notice-error" role="alert">
          <strong>Upload failed</strong>
          <span>{error}</span>
          <div className="notice-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => start(file)}>
              Try again
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setState('idle');
                setFile(null);
              }}
            >
              Choose another file
            </button>
          </div>
        </div>
      )}

      {state === 'done' && warnings.map((w) => (
        <div key={w} className="notice notice-warn" role="status">
          <strong>Low resolution</strong>
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}
