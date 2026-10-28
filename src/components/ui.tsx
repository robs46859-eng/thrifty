import { X, ArrowUpRight, Check, ScanLine, Lamp, Dog } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <button className="icon-btn" onClick={close} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={`field ${wide ? 'wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
export function Tag({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <ScanLine size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
      {action}
    </div>
  );
}
export function Fact({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export function ItemArt({ kind = 'fleece', small = false }: { kind?: string; small?: boolean }) {
  if (kind === 'lamp')
    return (
      <div className={`item-art lamp-art ${small ? 'small' : ''}`}>
        <Lamp strokeWidth={0.9} size={small ? 44 : 180} />
      </div>
    );
  if (kind === 'pet')
    return (
      <div className={`item-art pet-art ${small ? 'small' : ''}`}>
        <Dog strokeWidth={1} size={small ? 44 : 170} />
      </div>
    );
  return (
    <svg
      className={`item-art ${small ? 'small' : ''}`}
      viewBox="0 0 380 360"
      role="img"
      aria-label="Illustration of a sage green fleece pullover"
    >
      <defs>
        <linearGradient id={small ? 'fabric-sm' : 'fabric'} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#92a78e" />
          <stop offset="1" stopColor="#5c7b68" />
        </linearGradient>
        <filter id={small ? 'shadow-sm' : 'shadow'}>
          <feDropShadow dx="0" dy="15" stdDeviation="10" floodColor="#2e443b" floodOpacity=".12" />
        </filter>
      </defs>
      <g filter={`url(#${small ? 'shadow-sm' : 'shadow'})`}>
        <path
          d="M145 58 100 75 35 172 83 204 110 165 103 306Q190 325 277 306L270 165 297 204 345 172 280 75 235 58Z"
          fill={`url(#${small ? 'fabric-sm' : 'fabric'})`}
          stroke="#587362"
          strokeWidth="2"
        />
        <path d="m145 58 4-21q40-17 82 0l4 21-18 43h-51z" fill="#436556" />
        <path d="m149 37 21 30h39l22-30v28l-18 39h-48l-19-40z" fill="#658775" />
        <path d="M186 68h20v98h-20z" fill="#e8d8b2" />
        <path d="M190 74h12v86h-12z" fill="#4a695b" />
        <g fill="#eee2c4">
          <circle cx="196" cy="88" r="2" />
          <circle cx="196" cy="111" r="2" />
          <circle cx="196" cy="135" r="2" />
        </g>
        <path d="M220 130h37v33h-37z" fill="#456757" />
        <path d="M220 130h37v9h-37z" fill="#d8cba9" />
        <path
          d="M111 235q79-25 158 0M105 296q86 16 172 0M43 164l47 30M290 194l47-30"
          fill="none"
          stroke="#486959"
          strokeWidth="4"
          opacity=".45"
        />
        <path
          d="M126 95 115 160m139-65 12 65"
          fill="none"
          stroke="#b5c4a4"
          strokeWidth="2"
          opacity=".45"
        />
      </g>
    </svg>
  );
}
export const Checked = ({ children }: { children: ReactNode }) => (
  <li>
    <Check size={15} />
    <span>{children}</span>
  </li>
);
export const External = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="text-link">
    {children}
    <ArrowUpRight size={14} />
  </a>
);
