import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { Logo, Sidebar } from './Sidebar';
import LiveView from '../live/LiveView';

export function Shell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="app">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="topbar">
        <Logo />
        <button
          type="button"
          className="menu-btn"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="sidebar"
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name={open ? 'close' : 'menu'} size={22} />
        </button>
      </header>

      <Sidebar open={open} onNavigate={() => setOpen(false)} />
      {open && <div className="backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}

      <main id="main" className="content" tabIndex={-1}>
        <Outlet />
      </main>
      <LiveView />
    </div>
  );
}
