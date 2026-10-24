import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useApp } from '../AppContext';
import { Icon, PlayIcon, type IconName } from './Icon';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/videos', label: 'Videos', icon: 'video' },
  { to: '/images', label: 'Images', icon: 'image' },
  { to: '/assets', label: 'Assets', icon: 'folder' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/branding', label: 'Branding', icon: 'drop' },
  { to: '/analytics', label: 'Analytics', icon: 'chart' },
];

function BrandSwitcher() {
  const { session, brand, setBrandId } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const brands = session?.brands ?? [];
  const index = brand ? brands.findIndex((b) => b.id === brand.id) + 1 : 0;

  return (
    <div className="brand-switcher" ref={ref}>
      <button
        type="button"
        className="brand-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="brand-avatar">{brand?.initials ?? ''}</span>
        <span className="brand-text">
          <span className="brand-name">{brand?.name ?? 'Loading…'}</span>
          <span className="brand-sub">{brand ? `Brand ${index} of ${brands.length}` : ' '}</span>
        </span>
        <Icon name="updown" size={16} strokeWidth={2} />
      </button>
      {open && (
        <ul className="brand-menu" aria-label="Switch brand">
          {brands.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                aria-current={b.id === brand?.id ? 'true' : undefined}
                onClick={() => {
                  setBrandId(b.id);
                  setOpen(false);
                }}
              >
                <span className="brand-avatar">{b.initials}</span>
                {b.name}
                {b.id === brand?.id && <Icon name="check" size={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">
        <PlayIcon />
      </span>
      <span className="logo-word">Creator Hub</span>
    </div>
  );
}

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { session } = useApp();
  const credits = session?.credits;
  const left = credits ? credits.total - credits.used : 0;
  const pct = credits ? Math.round((left / credits.total) * 100) : 0;

  return (
    <aside id="sidebar" className={`sidebar${open ? ' is-open' : ''}`}>
      <Logo />
      <BrandSwitcher />
      <Link to="/videos/new" className="btn btn-soft btn-lg new-project" onClick={onNavigate}>
        <Icon name="plus" size={18} strokeWidth={2.2} />
        New project
      </Link>

      <nav aria-label="Main menu" className="nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-link" onClick={onNavigate}>
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      <div className="credits">
        <div className="credits-row">
          <span className="muted" id="credits-label">Credits</span>
          <span className="credits-value">
            {credits ? `${left.toLocaleString('en-US')} / ${credits.total.toLocaleString('en-US')}` : '…'}
          </span>
        </div>
        <div
          className="credits-bar"
          role="meter"
          aria-labelledby="credits-label"
          aria-valuemin={0}
          aria-valuemax={credits?.total ?? 0}
          aria-valuenow={left}
        >
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>

      <nav aria-label="Account" className="nav">
        <NavLink to="/settings" className="nav-link" onClick={onNavigate}>
          <Icon name="sliders" />
          Settings &amp; billing
        </NavLink>
        <NavLink to="/help" className="nav-link" onClick={onNavigate}>
          <Icon name="help" />
          Help
        </NavLink>
      </nav>
    </aside>
  );
}
