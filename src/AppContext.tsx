import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as engine from './engine';

interface AppState {
  session: engine.Session | null;
  brand: engine.Brand | null;
  setBrandId: (id: string) => void;
  /** Re-read credits and brands, for example after buying credits. */
  refreshSession: () => Promise<void>;
}

const Ctx = createContext<AppState>({ session: null, brand: null, setBrandId: () => {}, refreshSession: async () => {} });

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<engine.Session | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    engine.getSession().then((s) => {
      if (!alive) return;
      setSession(s);
      setBrandId((cur) => cur ?? s.brands[0]?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const refreshSession = useCallback(async () => {
    setSession(await engine.getSession());
  }, []);

  const brand = session?.brands.find((b) => b.id === brandId) ?? null;
  return <Ctx.Provider value={{ session, brand, setBrandId, refreshSession }}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
