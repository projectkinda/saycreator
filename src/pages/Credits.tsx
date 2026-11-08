// Credits: every art pack listed in src/image-engine/art/credits.json with its author, source, licence and what was changed. An entry whose author is still TODO shows the pack name and
// the licence only (nothing looks broken).
import credits from '../image-engine/art/credits.json';
import { useDocumentTitle } from '../useDocumentTitle';

interface Entry {
  pack: string;
  name: string;
  author: string;
  source: string;
  licence: string;
  licenceUrl: string;
  note: string;
}
const filled = (v: string) => !!v && v.trim().toUpperCase() !== 'TODO';
const isUrl = (v: string) => /^https?:\/\//i.test(v);

export default function Credits() {
  useDocumentTitle('Credits');
  const packs = credits.packs as Entry[];
  return (
    <div className="page credits-page">
      <h1 className="page-title">Credits</h1>
      <p className="muted">{credits.note.split('. ')[0]}.</p>
      <ul className="credits-list" aria-label="Art packs">
        {packs.map((p) => (
          <li key={p.pack} className="card credits-item" data-testid={`credit-${p.pack}`}>
            <strong>{p.name}</strong>
            <span className="small">
              {filled(p.author) && <>By {p.author}. </>}
              {filled(p.source) && (isUrl(p.source) ? <><a href={p.source} target="_blank" rel="noreferrer">Source</a>. </> : <>Source: {p.source}. </>)}
              Licence: <a href={p.licenceUrl} target="_blank" rel="noreferrer">{p.licence}</a>. {p.note}.
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
