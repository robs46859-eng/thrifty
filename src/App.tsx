import { useEffect, useRef, useState } from 'react';
import { useAuth, AccountButton } from './lib/auth';
import {
  ScanLine,
  House,
  Store,
  ChartNoAxesCombined,
  Cable,
  Leaf,
  ArrowDownToLine,
  CircleHelp,
  Download,
  Upload,
  WifiOff,
  ShieldCheck,
  Check,
  ArrowUpRight,
  Menu,
  X,
  Database,
  RotateCcw,
} from 'lucide-react';
import { WorkspaceContext, type Page } from './lib/context';
import { loadState, parseImport, saveState, download, STORAGE_KEY } from './lib/storage';
import { initialState } from './lib/seed';
import { today } from './lib/model';
import { Scan } from './components/Scan';
import { Household } from './components/Household';
import { Merchant } from './components/Merchant';
import { Pricing } from './components/Pricing';
import { Connections } from './components/Connections';
import { Modal, Tag } from './components/ui';
const navigation = [
  { id: 'scan', label: 'Scan a find', short: 'Scan', icon: ScanLine },
  { id: 'household', label: 'Your household', short: 'Household', icon: House },
  { id: 'merchant', label: 'Merchant studio', short: 'Shop', icon: Store },
  { id: 'pricing', label: 'Pricing & listings', short: 'Pricing', icon: ChartNoAxesCombined },
  { id: 'connections', label: 'Connections', short: 'Connect', icon: Cable },
] as const;
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
function currentPage(): Page {
  const hash = window.location.hash.slice(1);
  return navigation.some((n) => n.id === hash) ? (hash as Page) : 'scan';
}
function WorkspaceApp({ workspaceKey }: { workspaceKey: string }) {
  const [loaded] = useState(() => loadState(localStorage, workspaceKey));
  const [state, setState] = useState(loaded.state);
  const [blockedStorage, setBlockedStorage] = useState(!!loaded.warning);
  const [warning, setWarning] = useState(loaded.warning);
  const [page, setPage] = useState<Page>(currentPage);
  const [mode, setMode] = useState<'merchant' | 'household'>(
    currentPage() === 'household' ? 'household' : 'merchant',
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [modal, setModal] = useState<'workspace' | 'help' | 'install' | null>(null);
  const [notification, setNotification] = useState('');
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const importInput = useRef<HTMLInputElement>(null);
  function toast(message: string) {
    clearTimeout(timeout.current);
    setNotification(message);
    timeout.current = setTimeout(() => setNotification(''), 4500);
  }
  function navigate(next: Page) {
    setPage(next);
    window.location.hash = next;
    if (next === 'household') setMode('household');
    if (next === 'merchant' || next === 'pricing') setMode('merchant');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  useEffect(() => {
    const changed = () => setOnline(navigator.onLine);
    const hash = () => {
      const next = currentPage();
      setPage(next);
      if (next === 'household') setMode('household');
      if (next === 'merchant' || next === 'pricing') setMode('merchant');
    };
    const prompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPrompt);
    };
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    window.addEventListener('hashchange', hash);
    window.addEventListener('beforeinstallprompt', prompt);
    return () => {
      clearTimeout(timeout.current);
      window.removeEventListener('online', changed);
      window.removeEventListener('offline', changed);
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('beforeinstallprompt', prompt);
    };
  }, []);
  useEffect(() => {
    if (!blockedStorage) setWarning(saveState(state, localStorage, workspaceKey));
  }, [state, blockedStorage, workspaceKey]);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let reload = false;
    const controller = () => {
      if (reload) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', controller);
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (reg.waiting) setUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller)
              setUpdate(worker);
          });
        });
      })
      .catch(() => {
        /* app remains usable without offline cache */
      });
    const handler = () => {
      reload = true;
    };
    window.addEventListener('thrifty-update', handler);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', controller);
      window.removeEventListener('thrifty-update', handler);
    };
  }, []);
  async function importWorkspace(file?: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast('Backup is too large. Maximum size is 10 MB.');
      return;
    }
    try {
      const imported = parseImport(await file.text());
      if (
        !confirm(
          'Replace this device’s workspace with the imported backup? Export your current workspace first if needed.',
        )
      )
        return;
      setState(imported);
      setBlockedStorage(false);
      setWarning('');
      toast('Workspace imported');
    } catch {
      toast(
        'That backup is invalid or uses an unsupported format. Your current workspace was kept.',
      );
    }
  }
  const views = {
    scan: <Scan />,
    household: <Household />,
    merchant: <Merchant />,
    pricing: <Pricing />,
    connections: <Connections />,
  };
  return (
    <WorkspaceContext.Provider value={{ state, setState, mode, setMode, navigate, toast }}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <a
            className="brand"
            href="#scan"
            onClick={(e) => {
              e.preventDefault();
              navigate('scan');
            }}
          >
            <span className="brand-mark">
              <Leaf size={27} strokeWidth={1.7} />
            </span>
            thrifty<span className="brand-dot">.</span>
          </a>
          <div className="brand-caption">FIND THE GOOD.</div>
          <div className="nav-label">YOUR EVERYDAY COMPANION</div>
          <nav aria-label="Main navigation">
            {navigation.map((n) => (
              <button
                key={n.id}
                aria-current={page === n.id ? 'page' : undefined}
                className={page === n.id ? 'nav-item active' : 'nav-item'}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={20} />
                <span>{n.label}</span>
                {page === n.id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-tip">
              <span className="seed-icon">✳</span>
              <h3>
                Secondhand.
                <br />
                First choice.
              </h3>
              <p>
                A little less new.
                <br />A lot more possibility.
              </p>
            </div>
            <button className="nav-item" onClick={() => setModal('workspace')}>
              <Database size={19} /> Workspace
            </button>
            <button className="nav-item" onClick={() => setModal('help')}>
              <CircleHelp size={19} /> A little guidance
            </button>
            <div className="sidebar-user">
              <span className="user-avatar">Y</span>
              <div>
                Your workspace<small>Local to this device</small>
              </div>
              <ShieldCheck size={17} />
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <a className="mobile-brand" href="#scan">
              thrifty.
            </a>
            <div className="breadcrumb">
              Your workspace <span>/</span>{' '}
              <strong>{navigation.find((n) => n.id === page)?.label}</strong>
            </div>
            <div className="topbar-actions">
              <AccountButton />
              {!online && (
                <span className="offline">
                  <WifiOff size={15} /> Offline
                </span>
              )}
              <div className="mode-switch" aria-label="Shopping mode">
                <button
                  className={mode === 'merchant' ? 'active' : ''}
                  aria-pressed={mode === 'merchant'}
                  onClick={() => setMode('merchant')}
                >
                  <Store size={15} />
                  <span>Merchant</span>
                </button>
                <button
                  className={mode === 'household' ? 'active' : ''}
                  aria-pressed={mode === 'household'}
                  onClick={() => setMode('household')}
                >
                  <House size={15} />
                  <span>Household</span>
                </button>
              </div>
              <button
                className="install-btn"
                onClick={async () => {
                  if (install) {
                    await install.prompt();
                    await install.userChoice;
                    setInstall(null);
                  } else setModal('install');
                }}
              >
                <ArrowDownToLine size={17} />
                <span>Get the app</span>
              </button>
              <button
                className="mobile-workspace icon-btn"
                aria-label="Workspace and backup"
                onClick={() => setModal('workspace')}
              >
                <Database size={19} />
              </button>
            </div>
          </header>
          <main id="main" tabIndex={-1}>
            {warning && (
              <div className="notice warning" role="alert">
                {warning}{' '}
                <button className="text-link" onClick={() => setModal('workspace')}>
                  Open workspace
                </button>
              </div>
            )}
            {update && (
              <div className="notice">
                An app update is ready. Save your current find, then{' '}
                <button
                  className="text-link"
                  onClick={() => {
                    window.dispatchEvent(new Event('thrifty-update'));
                    update.postMessage({ type: 'SKIP_WAITING' });
                  }}
                >
                  reload the app
                </button>
                .
              </div>
            )}
            {views[page]}
            <footer className="page-footer">
              <span>
                <Leaf size={14} /> A good find deserves a second story.
              </span>
              <span>USD · Local-first · Thrifty v0.1</span>
            </footer>
          </main>
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map((n) => (
          <button
            key={n.id}
            className={page === n.id ? 'active' : ''}
            aria-current={page === n.id ? 'page' : undefined}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={21} />
            <span>{n.short}</span>
          </button>
        ))}
      </nav>
      {notification && (
        <div className="toast" role="status">
          <Check size={17} />
          {notification}
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setNotification('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal === 'workspace' && (
        <Modal title="Your workspace" close={() => setModal(null)}>
          <div className="notice">
            <ShieldCheck size={18} />
            <div>
              Inventories, goals, profiles and drafts are stored in this browser. There is no
              account, cloud backup, or cross-device sync. Photos are kept only for the scan
              session.
            </div>
          </div>
          <div className="workspace-stats">
            <div>
              <strong>{state.inventory.length}</strong>
              <span>saved items</span>
            </div>
            <div>
              <strong>{state.goals.length}</strong>
              <span>shopping goals</span>
            </div>
            <div>
              <strong>{state.drafts.length}</strong>
              <span>listing drafts</span>
            </div>
          </div>
          <div className="workspace-buttons">
            <button
              className="btn primary"
              onClick={() =>
                download(`thrifty-workspace-${today()}.json`, JSON.stringify(state, null, 2))
              }
            >
              <Download size={17} /> Export workspace
            </button>
            <button className="btn secondary" onClick={() => importInput.current?.click()}>
              <Upload size={17} /> Import backup
            </button>
            <input
              hidden
              type="file"
              ref={importInput}
              accept="application/json,.json"
              onChange={(e) => {
                void importWorkspace(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {blockedStorage && (
              <button
                className="btn secondary"
                onClick={() => {
                  try {
                    download(
                      `thrifty-unreadable-backup-${today()}.txt`,
                      localStorage.getItem(workspaceKey) ?? '',
                    );
                  } catch {
                    toast('Storage is unavailable');
                  }
                }}
              >
                Export original unreadable data
              </button>
            )}
            <button
              className="btn danger"
              onClick={() => {
                if (
                  confirm(
                    'Clear all inventory, sales, drafts and custom goals from this device? Starter example profiles and goals will be restored. Export a backup first.',
                  )
                ) {
                  setState(initialState());
                  setBlockedStorage(false);
                  setWarning('');
                  toast('Workspace reset to starter examples');
                }
              }}
            >
              <RotateCcw size={16} /> Reset workspace
            </button>
          </div>
          <p className="micro">
            Workspace backups may contain household information. Keep them private. Resetting does
            not remove backups you already exported.
          </p>
        </Modal>
      )}
      {modal === 'help' && (
        <Modal title="A little guidance" close={() => setModal(null)}>
          <div className="help-steps">
            <h3>1. Start with the find</h3>
            <p>
              Take or upload a photo. Without configured cloud analysis, read the label and enter
              the details yourself. Samples use fictional items and comparables.
            </p>
            <h3>2. Look through both lenses</h3>
            <p>
              Merchant scoring considers costs, shop focus and your recorded sales. Household
              scoring matches shopping goals, sizes, budgets and duplicates. Scores are decision
              aids.
            </p>
            <h3>3. Make it yours</h3>
            <p>
              Confirm details before saving. Prepare drafts, add sold comparables, and record actual
              sales. Nothing publishes or reprices automatically.
            </p>
            <h3>4. Bring a backup</h3>
            <p>
              Export your workspace regularly. Installed apps can reopen offline after their first
              online load; cloud identification still needs internet.
            </p>
          </div>
        </Modal>
      )}
      {modal === 'install' && (
        <Modal title="Keep Thrifty close" close={() => setModal(null)}>
          <p>
            On iPhone or iPad, open Thrifty in Safari, tap Share, then Add to Home Screen. In Chrome
            or Edge, use the browser’s install app option when available.
          </p>
          <p>
            The installed app can reopen offline after its first online load. Your data remains in
            this browser. Camera capture and installation require HTTPS or localhost.
          </p>
          <button className="btn primary full" onClick={() => setModal(null)}>
            Got it
          </button>
        </Modal>
      )}
    </WorkspaceContext.Provider>
  );
}

export default function App() {
  const { info } = useAuth();
  const workspaceKey = info.user ? `${STORAGE_KEY}.account.${info.user.id}` : STORAGE_KEY;
  return <WorkspaceApp key={workspaceKey} workspaceKey={workspaceKey} />;
}
