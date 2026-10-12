/** Composants communs du portail (balisage et classes identiques à la maquette validée). */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../icons';

export type BadgeDef = [cls: string, icon: string, text: string];
export const Badge = ({ def }: { def: BadgeDef }) => (
  <span className={`badge ${def[0]}`}>
    <Icon name={def[1]} />
    {def[2]}
  </span>
);

export const PLAN_BADGE: Record<string, BadgeDef> = { free: ['b-neutral', 'person-outline', 'Gratuit'], plus: ['b-primary', 'star-outline', 'Plus'], family: ['b-accent', 'people-outline', 'Famille'] };
export const STATUS_BADGE: Record<string, BadgeDef> = { active: ['b-success', 'checkmark-circle', 'Actif'], suspended: ['b-danger', 'ban', 'Suspendu'], invited: ['b-info', 'mail-outline', 'Invitation envoyée'] };
export const RESULT_BADGE: Record<string, BadgeDef> = { ok: ['b-success', 'checkmark-circle', 'Réussi'], denied: ['b-danger', 'close-circle', 'Refusé'], error: ['b-warning', 'alert-circle', 'Erreur'] };

// ─── Message de succès (toast) ──────────────────────────────────────

const ToastCtx = createContext<(text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((s: string) => {
    setText(s);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setText(null), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {text && (
        <div className="toast" role="status" aria-live="polite">
          <Icon name="checkmark-circle" />
          {text}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// ─── Fenêtre (modale) ────────────────────────────────────────────────

export function Dialog({ title, intro, icon, tone = 'primary', onClose, children, footer }: { title: string; intro?: ReactNode; icon: string; tone?: 'primary' | 'danger' | 'warning' | 'neutral'; onClose: () => void; children?: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([disabled])')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          f[f.length - 1].focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          f[0].focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  const hico = { primary: ['var(--primaryContainer)', 'var(--primary)'], danger: ['var(--dangerBg)', 'var(--danger)'], warning: ['var(--warningBg)', 'var(--warning)'], neutral: ['var(--surfaceAlt)', 'var(--textMuted)'] }[tone];
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t" ref={ref}>
        <header>
          <span className="hico" style={{ background: hico[0], color: hico[1] }}>
            <Icon name={icon} />
          </span>
          <div>
            <h2 id="dlg-t">{title}</h2>
            {intro && (
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                {intro}
              </p>
            )}
          </div>
        </header>
        {children && <div className="body">{children}</div>}
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

// ─── États ───────────────────────────────────────────────────────────

export const Loading = ({ rows = 4 }: { rows?: number }) => (
  <div className="card-pad" style={{ display: 'grid', gap: 14 }} role="status" aria-label="Chargement en cours">
    {[80, 60, 70, 50].slice(0, rows).map((w) => (
      <div key={w} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span className="skel" style={{ width: 36, height: 36, borderRadius: '50%' }} />
        <div style={{ flex: 1, display: 'grid', gap: 6 }}>
          <span className="skel" style={{ width: `${w}%` }} />
          <span className="skel" style={{ width: `${w - 25}%`, height: 10 }} />
        </div>
      </div>
    ))}
    <span className="caption subtle">Chargement…</span>
  </div>
);

export const Empty = ({ icon = 'search-outline', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) => (
  <div className="state">
    <span className="pill">
      <Icon name={icon} />
    </span>
    <h3>{title}</h3>
    {text && <p className="small">{text}</p>}
    {action}
  </div>
);

export const ErrorState = ({ text, onRetry }: { text: string; onRetry?: () => void }) => (
  <div className="state err" role="alert">
    <span className="pill">
      <Icon name="alert-circle" />
    </span>
    <h3>Impossible de charger</h3>
    <p className="small">{text}</p>
    {onRetry && (
      <button className="btn secondary sm" onClick={onRetry}>
        <Icon name="refresh-outline" />
        Réessayer
      </button>
    )}
  </div>
);

export const Msg = ({ tone, icon, children }: { tone: 'info' | 'warning' | 'danger' | 'success'; icon: string; children: ReactNode }) => (
  <div className={`msg ${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
    <Icon name={icon} />
    <div>{children}</div>
  </div>
);

/** Chargement d'une ressource du serveur : état, erreur, rechargement. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: unknown; loading: boolean; reload: () => void } {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error) => alive && setState({ data: null, error, loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}
