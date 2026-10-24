import { useParams } from 'react-router-dom';
import { useDocumentTitle } from '../useDocumentTitle';

export function Placeholder({ title, note }: { title: string; note?: string }) {
  useDocumentTitle(title);
  const { id } = useParams();
  return (
    <div className="page">
      <h1 className="page-title">{title}</h1>
      <section className="card placeholder">
        <h2>Not built yet</h2>
        <p className="muted">
          {note ?? 'This screen comes in a later step. The menu and route already work.'}
          {id ? ` (Project: ${id})` : ''}
        </p>
      </section>
    </div>
  );
}
