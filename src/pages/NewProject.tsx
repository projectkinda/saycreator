import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { UploadProgress } from '../components/UploadProgress';
import * as engine from '../engine';
import { useDocumentTitle } from '../useDocumentTitle';

export default function NewProject() {
  useDocumentTitle('New project');
  const { brand } = useApp();
  const [params] = useSearchParams();
  const source = params.get('source') === 'record' ? 'record' : 'upload';
  const project = useRef<engine.Project | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [step, setStep] = useState<'upload' | 'listening' | 'ready'>('upload');

  const run = async (file: File, onProgress: (f: number) => void) => {
    if (!brand) throw new Error('Still loading your account. Try again in a moment.');
    // Keep the project across retries so a failed upload does not create duplicates.
    const p = project.current ?? (await engine.createProject({ brandId: brand.id, title: file.name.replace(/\.[^.]+$/, ''), source: 'upload' }));
    project.current = p;
    const result = await engine.uploadVideo(p.id, file, onProgress);
    project.current = result.project;
    return result.warnings;
  };

  const analyse = () => {
    const id = project.current?.id;
    if (!id) return;
    setStep('listening');
    engine.analyse(id).then(() => setStep('ready')).catch(() => setStep('upload'));
  };

  return (
    <div className="page page-tight">
      <header>
        <h1 className="page-title">{source === 'record' ? 'Record a video' : 'Upload a video'}</h1>
        <p className="lead">We listen to it first, then you pick a style.</p>
      </header>

      {source === 'record' ? (
        <section className="card empty">
          <strong>Recording in the browser is not built yet</strong>
          <span className="muted">For now, record on your phone or laptop and upload the file.</span>
          <Link to="/videos/new?source=upload" className="btn btn-outline btn-sm">Upload a video instead</Link>
        </section>
      ) : (
        <section className="card new-card" aria-labelledby="up-h">
          <h2 id="up-h" className="h2">Add your video</h2>
          <p className="muted small">Any length, phone or laptop. Your original file is never changed.</p>
          {step === 'upload' && (
            <UploadProgress
              label="Choose a video"
              buttonClass="btn btn-primary btn-lg"
              hint="MP4, MOV or WebM."
              run={run}
              onDone={(w) => {
                setWarnings(w);
                analyse();
              }}
            />
          )}
          {step !== 'upload' && warnings.map((w) => (
            <div key={w} className="notice notice-warn" role="status">
              <strong>Low resolution</strong>
              <span>{w}</span>
            </div>
          ))}
          {step === 'listening' && (
            <p role="status" className="small">Listening to your video…</p>
          )}
          {step === 'ready' && project.current && (
            <div className="notice notice-ok" role="status">
              <strong>Done listening</strong>
              <span>We found where you speak and where the shots change. Next: choose a style.</span>
              <div className="notice-actions">
                <Link to={`/videos/${project.current.id}`} className="btn btn-dark btn-sm">Choose a style</Link>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
