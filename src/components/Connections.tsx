import { ArrowUpRight, Cable, Check, LockKeyhole, FileText, CloudOff } from 'lucide-react';
import { marketplaces } from '../lib/marketplaces';
import { PageHeading, Tag } from './ui';
export function Connections() {
  return (
    <>
      <PageHeading eyebrow="YOUR FINDS, MORE PLACES" title="A workspace without borders.">
        Prepare once. Export a draft for the places you sell.
      </PageHeading>
      <div className="connection-banner">
        <span className="connection-hero-icon">
          <Cable size={35} />
        </span>
        <div>
          <Tag tone="amber">No live connections</Tag>
          <h2>Ready to draft. Honest about the rest.</h2>
          <p>
            Thrifty includes a common integration interface and manual listing exports. Credentials
            alone do not enable publishing: each marketplace still needs an implemented, tested
            adapter.
          </p>
        </div>
      </div>
      <div className="connection-grid">
        {marketplaces.map((m) => (
          <article className="card connection-card" key={m.id}>
            <div className="card-top">
              <span className="market-icon large" style={{ background: m.color }}>
                {m.initial}
              </span>
              <Tag>{m.route}</Tag>
            </div>
            <h3>{m.name}</h3>
            <div className="disconnected">
              <span /> Disconnected
            </div>
            <ul className="capabilities">
              <li>
                <Check size={15} /> Local listing drafts
              </li>
              <li>
                <Check size={15} /> Manual text export
              </li>
              <li className="muted">
                <LockKeyhole size={14} /> Publishing & price sync unavailable
              </li>
            </ul>
            <p>{m.requirement}</p>
            <a className="text-link" href={m.docs} target="_blank" rel="noreferrer">
              {m.route === 'Manual export' ? 'Open marketplace' : 'Integration documentation'}
              <ArrowUpRight size={15} />
            </a>
          </article>
        ))}
      </div>
      <div className="notice">
        <CloudOff size={19} />
        <div>
          There are no active marketplace tokens, market feeds, scheduled repricing jobs, or order
          webhooks in this build. Manual exports let you continue working while integrations are
          developed.
        </div>
      </div>
    </>
  );
}
