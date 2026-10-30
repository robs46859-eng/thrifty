import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { LogIn, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Modal, Field, Tag } from '../components/ui';
export type SignedInUser = { id: string; email: string; name: string; admin: boolean };
export type ScanUsage = {
  unlimited: boolean;
  dailyLimit: number | null;
  dailyUsed: number;
  remaining: number | null;
  minuteLimit: number | null;
  resetsAt: string;
};
export type AuthSnapshot = {
  authenticated: boolean;
  configured: boolean;
  user: SignedInUser | null;
  csrf: string | null;
  nonce: string | null;
  googleClientId: string | null;
  emailEnabled: boolean;
  usage: ScanUsage | null;
  limits: { daily: number; minute: number };
};
const empty: AuthSnapshot = {
  authenticated: false,
  configured: false,
  user: null,
  csrf: null,
  nonce: null,
  googleClientId: null,
  emailEnabled: false,
  usage: null,
  limits: { daily: 10, minute: 3 },
};
export class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryAfter: number,
  ) {
    super(message);
  }
}
type AuthContextValue = {
  info: AuthSnapshot;
  loading: boolean;
  openSignIn: () => void;
  refresh: () => Promise<void>;
  request: (path: string, body: unknown) => Promise<unknown>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Missing authentication context');
  return value;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState(empty),
    [loading, setLoading] = useState(true),
    [open, setOpen] = useState(false);
  const current = useRef(info);
  const refreshing = useRef<Promise<void> | null>(null);
  current.current = info;
  const refresh = useCallback(() => {
    // React StrictMode and reconnect events can overlap. Issue only one
    // bootstrap request so its CSRF response always matches the cookie.
    if (refreshing.current) return refreshing.current;
    refreshing.current = (async () => {
      try {
        const response = await fetch('/api/auth/session', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('Session unavailable');
        const data = await response.json();
        if (typeof data.authenticated !== 'boolean' || !data.limits)
          throw new Error('Invalid session');
        setInfo(data);
      } catch {
        setInfo(empty);
      } finally {
        setLoading(false);
        refreshing.current = null;
      }
    })();
    return refreshing.current;
  }, []);
  useEffect(() => {
    void refresh();
    const online = () => {
      void refresh();
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [refresh]);
  const request = useCallback(
    async (path: string, body: unknown) => {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(25000),
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': current.current.csrf ?? '' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({
        error: 'The sign-in service is temporarily unavailable. Please try again later.',
        code: 'SERVICE_UNAVAILABLE',
      }));
      if (!response.ok) {
        if (response.status === 401 && path === '/api/identify') {
          await refresh();
          setOpen(true);
        }
        throw new AuthRequestError(
          data.error ?? 'The request could not be completed.',
          data.code ?? 'REQUEST_FAILED',
          response.status,
          Number(response.headers.get('retry-after') || 0),
        );
      }
      if (path === '/api/auth/google' || path === '/api/auth/email/verify') setInfo(data);
      if (path === '/api/auth/logout') await refresh();
      return data;
    },
    [refresh],
  );
  return (
    <AuthContext.Provider
      value={{ info, loading, refresh, request, openSignIn: () => setOpen(true) }}
    >
      {children}
      {open && <AccountDialog close={() => setOpen(false)} />}
    </AuthContext.Provider>
  );
}
export function AccountButton() {
  const { info, loading, openSignIn } = useAuth();
  return (
    <button
      className="account-button"
      onClick={openSignIn}
      disabled={loading}
      aria-label={info.user ? 'Manage account' : 'Sign in'}
    >
      <UserRound size={18} />
      <span>
        {loading ? 'Checking…' : info.user ? (info.user.admin ? 'Admin' : 'Account') : 'Sign in'}
      </span>
    </button>
  );
}
type GoogleApi = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        nonce: string;
        callback: (result: { credential: string }) => void;
        auto_select: boolean;
      }) => void;
      renderButton: (
        element: HTMLElement,
        options: { theme: string; size: string; width: number; text: string },
      ) => void;
      disableAutoSelect: () => void;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleApi;
  }
}
let googleLoading: Promise<void> | undefined;
function loadGoogle() {
  if (window.google) return Promise.resolve();
  if (!googleLoading)
    googleLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.dataset.thriftyGoogle = 'true';
      script.onload = () =>
        window.google ? resolve() : reject(new Error('Google sign-in did not load.'));
      script.onerror = () => {
        googleLoading = undefined;
        script.remove();
        reject(new Error('Google sign-in could not load. Try email sign-in instead.'));
      };
      document.head.appendChild(script);
    });
  return googleLoading;
}
function GoogleButton({
  onSuccess,
  onError,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const { info, request } = useAuth();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    if (!info.googleClientId || !info.nonce) return;
    loadGoogle()
      .then(() => {
        if (!active || !element.current) return;
        window.google!.accounts.id.initialize({
          client_id: info.googleClientId!,
          nonce: info.nonce!,
          auto_select: false,
          callback: (result) => {
            if (!active) return;
            void request('/api/auth/google', { credential: result.credential })
              .then(() => {
                if (active) onSuccess();
              })
              .catch((error) => {
                if (active)
                  onError(error instanceof Error ? error.message : 'Google sign-in failed.');
              });
          },
        });
        window.google!.accounts.id.renderButton(element.current, {
          theme: 'outline',
          size: 'large',
          width: 280,
          text: 'signin_with',
        });
      })
      .catch((error) => {
        if (active) onError(error.message);
      });
    return () => {
      active = false;
    };
  }, [info.googleClientId, info.nonce, request]);
  return <div ref={element} className="google-sign-in" />;
}
function AccountDialog({ close }: { close: () => void }) {
  const { info, request, refresh } = useAuth();
  const [email, setEmail] = useState(''),
    [code, setCode] = useState(''),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function send() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await request('/api/auth/email/request', { email });
      setSent(true);
      setMessage('A six-digit code has been sent. It expires in 10 minutes.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email could not be sent.');
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError('');
    try {
      await request('/api/auth/email/verify', { email, code });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Code verification failed.');
      if (e instanceof AuthRequestError && e.code === 'LOGIN_EXPIRED') {
        await refresh();
        setSent(false);
      }
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await request('/api/auth/logout', {});
      window.google?.accounts.id.disableAutoSelect();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-out failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={info.user ? 'Your account' : 'Sign in to scan smarter'} close={close}>
      {info.user ? (
        <>
          <div className="account-identity">
            <ShieldCheck size={26} />
            <div>
              <strong>{info.user.email}</strong>
              <Tag>{info.user.admin ? 'Administrator · unlimited scans' : 'Free account'}</Tag>
            </div>
          </div>
          <div className="account-usage">
            {info.usage?.unlimited ? (
              <>
                <strong>Unlimited cloud scans</strong>
                <p>
                  Your verified administrator account is exempt from daily and per-minute scan
                  quotas.
                </p>
              </>
            ) : (
              <>
                <strong>
                  {info.usage?.remaining ?? 0} of {info.limits.daily} cloud scans remaining today
                </strong>
                <p>
                  Up to {info.limits.minute} per minute. Daily allowance resets at midnight UTC
                  {info.usage
                    ? ` (${new Date(info.usage.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} your time)`
                    : ''}
                  .
                </p>
              </>
            )}
          </div>
          <p className="micro">
            Inventory and goals remain on this device, in a workspace for this account. Sign-in does
            not add cloud inventory backup. Export before switching browsers or devices.
          </p>
          <button className="btn secondary full" onClick={() => void signOut()} disabled={busy}>
            <LogOut size={16} /> Sign out
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Use Google or a code sent to your email. Free accounts include {info.limits.daily} cloud
            scans per day and {info.limits.minute} per minute. Manual shopping tools remain
            available without sign-in.
          </p>
          {!info.configured ? (
            <div className="notice">
              <ShieldCheck size={20} />
              <div>
                The site owner hasn’t enabled sign-in yet. Cloud scanning is locked while setup is
                completed.
              </div>
            </div>
          ) : (
            <>
              {info.googleClientId ? (
                <GoogleButton onSuccess={close} onError={setError} />
              ) : (
                <p className="micro">Google sign-in is not enabled yet.</p>
              )}
              {info.emailEnabled ? (
                <form
                  className="email-sign-in"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void (sent ? verify() : send());
                  }}
                >
                  <div className="auth-divider">
                    <span>or use email</span>
                  </div>
                  <Field label="Email address">
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setSent(false);
                        setCode('');
                        setMessage('');
                      }}
                      maxLength={254}
                      required
                      disabled={busy}
                    />
                  </Field>
                  {sent && (
                    <Field label="Six-digit sign-in code">
                      <input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                        required
                        disabled={busy}
                      />
                    </Field>
                  )}
                  <button className="btn primary full" type="submit" disabled={busy}>
                    {busy ? (
                      'Please wait…'
                    ) : sent ? (
                      <>
                        <LogIn size={16} /> Verify and sign in
                      </>
                    ) : (
                      <>
                        <Mail size={16} /> Email me a code
                      </>
                    )}
                  </button>
                  {sent && (
                    <button
                      type="button"
                      className="text-link resend-code"
                      disabled={busy}
                      onClick={() => void send()}
                    >
                      Send a new code
                    </button>
                  )}
                </form>
              ) : (
                <p className="micro">Email sign-in is not enabled yet.</p>
              )}
            </>
          )}
          {message && (
            <p className="auth-message" role="status">
              {message}
            </p>
          )}
          <p className="micro">
            Cloud requests count when sent to the AI provider, including requests that time out or
            fall back to manual review. Extra paid usage is not available yet.
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
