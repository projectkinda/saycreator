import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { dayMonth, parseDay } from '../dates';
import * as engine from '../engine';
import { useDocumentTitle } from '../useDocumentTitle';

const NAV = [
  { id: 'plan', label: 'Plan and credits' },
  { id: 'costs', label: 'What things cost' },
  { id: 'accounts', label: 'Connected accounts' },
  { id: 'export', label: 'Export defaults' },
  { id: 'delete', label: 'Delete account' },
];

const money = (n: number) => (n === 0 ? 'Free' : `$${n}`);
const num = (n: number) => n.toLocaleString('en-US');
const longDate = (s: string) => parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

interface Data {
  billing: engine.Billing;
  costs: engine.CostItem[];
  accounts: engine.ConnectedAccount[];
  defaults: engine.ExportDefaults;
  status: engine.AccountStatus;
}

const ASPECTS: engine.ExportDefaults['aspect'][] = ['9:16', '1:1', '16:9'];
const RESOLUTIONS: engine.ExportDefaults['resolution'][] = ['720p', '1080p', '4K'];

export default function Settings() {
  useDocumentTitle('Settings & billing');
  const { brand, refreshSession } = useApp();
  const brandId = brand?.id;
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [announce, setAnnounce] = useState('');

  const load = useCallback(() => {
    if (!brandId) return;
    setFailed(false);
    Promise.all([
      engine.getBilling(),
      engine.listCosts(),
      engine.listAccounts(brandId),
      engine.getExportDefaults(brandId),
      engine.getAccountStatus(),
    ])
      .then(([billing, costs, accounts, defaults, status]) => setData({ billing, costs, accounts, defaults, status }))
      .catch(() => setFailed(true));
  }, [brandId]);
  useEffect(() => {
    load();
  }, [load]);

  // Plan and credits
  const [panel, setPanel] = useState<'plan' | 'credits' | null>(null);
  const [planId, setPlanId] = useState('');
  const [packId, setPackId] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  // Accounts
  const [connecting, setConnecting] = useState<engine.Platform | null>(null);
  const [accountError, setAccountError] = useState('');

  // Export defaults
  const [draft, setDraft] = useState<engine.ExportDefaults | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsError, setDefaultsError] = useState('');

  // Account
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    if (data && !draft) setDraft(data.defaults);
  }, [data, draft]);

  const openPanel = (p: 'plan' | 'credits') => {
    if (!data) return;
    setPayError('');
    setPanel((cur) => (cur === p ? null : p));
    setPlanId(data.billing.plan.id);
    setPackId(data.billing.packs[0]?.id ?? '');
  };

  const pay = async (work: () => Promise<engine.Billing>, done: string) => {
    setPaying(true);
    setPayError('');
    try {
      const billing = await work();
      setData((d) => (d ? { ...d, billing } : d));
      await refreshSession();
      setPanel(null);
      setAnnounce(done);
    } catch (e) {
      setPayError((e as Error).message || 'That did not go through. You were not charged.');
    } finally {
      setPaying(false);
    }
  };

  const toggleAccount = async (a: engine.ConnectedAccount) => {
    if (!brandId) return;
    setConnecting(a.platform);
    setAccountError('');
    try {
      await (a.connected ? engine.disconnectAccount(brandId, a.platform) : engine.connectAccount(brandId, a.platform));
      const accounts = await engine.listAccounts(brandId);
      setData((d) => (d ? { ...d, accounts } : d));
      setAnnounce(`${a.name} ${a.connected ? 'disconnected' : 'connected'}`);
    } catch (e) {
      setAccountError((e as Error).message || 'That did not work. Nothing was changed.');
    } finally {
      setConnecting(null);
    }
  };

  const saveDefaults = async () => {
    if (!brandId || !draft) return;
    setSavingDefaults(true);
    setDefaultsError('');
    try {
      const saved = await engine.updateExportDefaults(brandId, draft);
      setData((d) => (d ? { ...d, defaults: saved } : d));
      setDraft(saved);
      setAnnounce('Export defaults saved');
    } catch (e) {
      setDefaultsError((e as Error).message || 'That did not save. Nothing was changed.');
    } finally {
      setSavingDefaults(false);
    }
  };

  const requestDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const status = await engine.requestAccountDeletion(typed);
      setData((d) => (d ? { ...d, status } : d));
      setConfirmDelete(false);
      setTyped('');
      setAnnounce('Account deletion scheduled');
    } catch (e) {
      setDeleteError((e as Error).message || 'That did not work. Nothing was changed.');
    } finally {
      setDeleting(false);
    }
  };

  const undoDelete = async () => {
    setDeleting(true);
    try {
      const status = await engine.cancelAccountDeletion();
      setData((d) => (d ? { ...d, status } : d));
      setAnnounce('Account deletion cancelled');
    } catch {
      setDeleteError('We could not undo that. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  const requestExport = async () => {
    setExportBusy(true);
    setExportMsg('');
    try {
      setExportMsg((await engine.requestDataExport()).message);
    } catch {
      setExportMsg('We could not start that. Nothing was changed, try again.');
    } finally {
      setExportBusy(false);
    }
  };

  const b = data?.billing;
  const left = b ? b.credits.total - b.credits.used : 0;
  const pct = b ? Math.max(0, Math.min(100, Math.round((left / b.credits.total) * 100))) : 0;
  const chosenPlan = b?.plans.find((p) => p.id === planId);
  const chosenPack = b?.packs.find((p) => p.id === packId);
  const defaultsChanged = !!data && !!draft && JSON.stringify(draft) !== JSON.stringify(data.defaults);

  return (
    <div className="page page-tight">
      <header>
        <h1 className="page-title">Settings &amp; billing</h1>
        <p className="lead">Plan and credits, what things cost, connected accounts and export defaults.</p>
      </header>

      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>

      {failed && (
        <div className="card empty" role="alert">
          <strong>We could not load your settings.</strong>
          <span className="muted">Nothing was changed. Check your connection and try again.</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>Try again</button>
        </div>
      )}
      {!data && !failed && <p className="muted" role="status">Loading your settings…</p>}

      {data && b && draft && (
        <>
          <nav aria-label="On this page" className="jump">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className="chip-btn plain jump-link">{n.label}</a>
            ))}
          </nav>

          {data.status.deletionScheduledFor && (
            <div className="notice notice-warn" role="status">
              <strong>Your account will be deleted on {longDate(data.status.deletionScheduledFor)}</strong>
              <span>Until then everything is still here and you can undo this.</span>
              <div className="notice-actions">
                <button type="button" className="btn btn-dark btn-sm" disabled={deleting} onClick={undoDelete}>
                  {deleting ? 'Undoing…' : 'Keep my account'}
                </button>
              </div>
            </div>
          )}

          {/* Plan and credits */}
          <section id="plan" className="card ws-card anchor" aria-labelledby="plan-h">
            <h2 id="plan-h" className="h3">Plan and credits</h2>
            <div className="plan-row">
              <div>
                <strong className="plan-name">{b.plan.name}</strong>
                <div className="small muted">
                  {b.plan.priceMonthly === 0 ? 'Free' : `${money(b.plan.priceMonthly)} a month`} · {b.plan.blurb}
                </div>
                <div className="small muted">{b.plan.priceMonthly === 0 ? 'Credits reset' : 'Renews'} on {longDate(b.renewsOn)} · {b.paymentMethod}</div>
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-outline btn-sm" aria-expanded={panel === 'plan'} onClick={() => openPanel('plan')}>Change plan</button>
                <button type="button" className="btn btn-outline btn-sm" aria-expanded={panel === 'credits'} onClick={() => openPanel('credits')}>Add credits</button>
              </div>
            </div>

            <div className="credits big-credits">
              <div className="credits-row">
                <span className="muted" id="credits-big-label">Credits left this month</span>
                <span className="credits-value">{num(left)} / {num(b.credits.total)}</span>
              </div>
              <div className="credits-bar" role="meter" aria-labelledby="credits-big-label" aria-valuemin={0} aria-valuemax={b.credits.total} aria-valuenow={left}>
                <div style={{ width: `${pct}%` }} />
              </div>
              <span className="small muted">{num(b.credits.used)} used. Credits reset on {dayMonth(b.renewsOn)}.</span>
            </div>

            {panel === 'plan' && (
              <fieldset className="choose">
                <legend className="field-label">Pick a plan</legend>
                <div className="choose-grid">
                  {b.plans.map((p) => (
                    <label key={p.id} className={`choice${planId === p.id ? ' is-selected' : ''}`}>
                      <input type="radio" name="plan" value={p.id} checked={planId === p.id} onChange={() => setPlanId(p.id)} />
                      <strong>{p.name}{p.id === b.plan.id ? ' (current)' : ''}</strong>
                      <span>{money(p.priceMonthly)}{p.priceMonthly ? ' a month' : ''}</span>
                      <span className="small muted">{num(p.creditsPerMonth)} credits a month. {p.blurb}</span>
                    </label>
                  ))}
                </div>
                {chosenPlan && chosenPlan.id !== b.plan.id && (
                  <p className="small" role="status">
                    {chosenPlan.priceMonthly > b.plan.priceMonthly
                      ? `You will be charged ${money(chosenPlan.priceMonthly)} to ${b.paymentMethod} today, and get ${num(chosenPlan.creditsPerMonth)} credits a month.`
                      : `Your plan changes to ${chosenPlan.name} with ${num(chosenPlan.creditsPerMonth)} credits a month. ${chosenPlan.priceMonthly === 0 ? 'You will not be charged.' : `${money(chosenPlan.priceMonthly)} a month from your next renewal.`}`}
                  </p>
                )}
                {payError && <div className="notice notice-error" role="alert"><strong>Plan not changed</strong><span>{payError}</span></div>}
                <div className="row-actions">
                  <button type="button" className="btn btn-dark btn-sm" disabled={paying || !chosenPlan || chosenPlan.id === b.plan.id} onClick={() => chosenPlan && pay(() => engine.changePlan(chosenPlan.id), `Plan changed to ${chosenPlan.name}`)}>
                    {paying ? 'Changing…' : chosenPlan && chosenPlan.id !== b.plan.id ? `Switch to ${chosenPlan.name}` : 'Switch plan'}
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" disabled={paying} onClick={() => setPanel(null)}>Cancel</button>
                </div>
              </fieldset>
            )}

            {panel === 'credits' && (
              <fieldset className="choose">
                <legend className="field-label">Add credits for this month</legend>
                <div className="choose-grid">
                  {b.packs.map((p) => (
                    <label key={p.id} className={`choice${packId === p.id ? ' is-selected' : ''}`}>
                      <input type="radio" name="pack" value={p.id} checked={packId === p.id} onChange={() => setPackId(p.id)} />
                      <strong>{num(p.credits)} credits</strong>
                      <span>${p.price}</span>
                    </label>
                  ))}
                </div>
                {chosenPack && (
                  <p className="small" role="status">
                    You will be charged ${chosenPack.price} to {b.paymentMethod}. The credits are added to this month's total right away.
                  </p>
                )}
                {payError && <div className="notice notice-error" role="alert"><strong>Nothing was added</strong><span>{payError}</span></div>}
                <div className="row-actions">
                  <button type="button" className="btn btn-dark btn-sm" disabled={paying || !chosenPack} onClick={() => chosenPack && pay(() => engine.buyCredits(chosenPack.id), `${num(chosenPack.credits)} credits added`)}>
                    {paying ? 'Charging…' : chosenPack ? `Buy ${num(chosenPack.credits)} credits for $${chosenPack.price}` : 'Buy credits'}
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" disabled={paying} onClick={() => setPanel(null)}>Cancel</button>
                </div>
              </fieldset>
            )}
          </section>

          {/* Costs */}
          <section id="costs" className="card ws-card anchor" aria-labelledby="costs-h">
            <h2 id="costs-h" className="h3">What things cost</h2>
            <p className="small muted">The price is on the button before anything runs, and you are never charged for a failed attempt.</p>
            <table className="cost-table">
              <thead>
                <tr><th scope="col">Action</th><th scope="col" className="num">Credits</th></tr>
              </thead>
              <tbody>
                {data.costs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.action}
                      {c.note && <div className="small muted">{c.note}</div>}
                    </td>
                    <td className="num">{c.credits === 0 ? 'Free' : num(c.credits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Accounts */}
          <section id="accounts" className="card ws-card anchor" aria-labelledby="acc-h">
            <h2 id="acc-h" className="h3">Connected accounts</h2>
            <p className="small muted">We only read your results to show them in Analytics. We never post for you.</p>
            <ul className="acc-list">
              {data.accounts.map((a) => (
                <li key={a.platform}>
                  <strong>{a.name}</strong>
                  <span className={a.connected ? 'chip chip-ok' : 'chip'}>{a.connected ? 'Connected' : 'Not connected'}</span>
                  <span className="grow" />
                  <button type="button" className="btn btn-outline btn-sm" disabled={connecting !== null} onClick={() => toggleAccount(a)}>
                    {connecting === a.platform ? (a.connected ? 'Disconnecting…' : 'Connecting…') : a.connected ? 'Disconnect' : 'Connect'}
                  </button>
                </li>
              ))}
            </ul>
            {accountError && <div className="notice notice-error" role="alert"><strong>Not changed</strong><span>{accountError}</span></div>}
          </section>

          {/* Export defaults */}
          <section id="export" className="card ws-card anchor" aria-labelledby="exp-h">
            <h2 id="exp-h" className="h3">Export defaults</h2>
            <p className="small muted">Used the next time you export a video. You can still change them for a single export.</p>
            <fieldset className="create-form">
              <legend className="field-label">Shape</legend>
              <div className="chip-group">
                {ASPECTS.map((a) => (
                  <button key={a} type="button" className="chip-btn" aria-pressed={draft.aspect === a} onClick={() => setDraft({ ...draft, aspect: a })}>
                    {a}{a === '9:16' ? ' vertical' : a === '1:1' ? ' square' : ' wide'}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="field">
              <span className="field-label">Quality</span>
              <select className="plain-select narrow" value={draft.resolution} onChange={(e) => setDraft({ ...draft, resolution: e.target.value as engine.ExportDefaults['resolution'] })}>
                {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={draft.burnCaptions} onChange={(e) => setDraft({ ...draft, burnCaptions: e.target.checked })} />
              <span>Put captions on the video itself</span>
            </label>
            {defaultsError && <div className="notice notice-error" role="alert"><strong>Not saved</strong><span>{defaultsError}</span></div>}
            <div className="row-actions">
              <button type="button" className="btn btn-dark btn-sm" disabled={savingDefaults || !defaultsChanged} onClick={saveDefaults}>
                {savingDefaults ? 'Saving…' : 'Save defaults'}
              </button>
              {!defaultsChanged && <span className="small muted">Nothing to save</span>}
            </div>
          </section>

          {/* Delete */}
          <section id="delete" className="card ws-card anchor" aria-labelledby="del-h">
            <h2 id="del-h" className="h3">Your data and your account</h2>
            <div className="row-actions">
              <button type="button" className="btn btn-outline btn-sm" disabled={exportBusy} onClick={requestExport}>
                {exportBusy ? 'Starting…' : 'Download my data'}
              </button>
              {exportMsg && <span className="small" role="status">{exportMsg}</span>}
            </div>
            <hr className="rule" />
            <h3 className="h4">Delete account</h3>
            <p className="small muted delete-copy">
              We delete your videos, images, assets, brand kit, writing voice and calendar 30 days after you ask. Until
              then you can change your mind with one click. Posts you already published stay where they are.
            </p>
            {data.status.deletionScheduledFor ? (
              <p className="small">Deletion is scheduled for {longDate(data.status.deletionScheduledFor)}. Use "Keep my account" at the top of this page to undo it.</p>
            ) : !confirmDelete ? (
              <div>
                <button type="button" className="btn btn-outline-strong btn-sm" aria-expanded={false} onClick={() => setConfirmDelete(true)}>
                  Delete my account…
                </button>
              </div>
            ) : (
              <div className="create-form">
                <label className="field">
                  <span className="field-label">Type DELETE to confirm</span>
                  <input type="text" className="text-input narrow" value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
                </label>
                {deleteError && <div className="notice notice-error" role="alert"><strong>Not scheduled</strong><span>{deleteError}</span></div>}
                <div className="row-actions">
                  <button type="button" className="btn btn-dark btn-sm" disabled={deleting || typed.trim() !== 'DELETE'} onClick={requestDelete}>
                    {deleting ? 'Scheduling…' : 'Delete my account'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={deleting}
                    onClick={() => {
                      setConfirmDelete(false);
                      setTyped('');
                      setDeleteError('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
