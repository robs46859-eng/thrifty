import type { Candidate, Comparable, Draft, Merchant } from './model';
import { pricing } from './scoring';
export const marketplaces = [
  {
    id: 'ebay',
    name: 'eBay',
    color: '#3765a6',
    initial: 'e',
    route: 'Seller API',
    requirement:
      'Developer app, seller OAuth, business policies, location, category and condition mappings.',
    docs: 'https://developer.ebay.com/api-docs/sell/inventory/overview.html',
  },
  {
    id: 'etsy',
    name: 'Etsy',
    color: '#c76632',
    initial: 'E',
    route: 'Seller API',
    requirement: 'Approved app, shop OAuth, listing taxonomy and eligibility review for each item.',
    docs: 'https://developer.etsy.com/documentation/essentials/authentication/',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    color: '#648c38',
    initial: 'S',
    route: 'Store API',
    requirement: 'Merchant store installation, Admin API access and product/inventory mappings.',
    docs: 'https://shopify.dev/docs/api/admin-graphql',
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    color: '#8561a8',
    initial: 'W',
    route: 'Store API',
    requirement: 'Store URL, server-side REST credentials and product/inventory mappings.',
    docs: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
  },
  {
    id: 'poshmark',
    name: 'Poshmark',
    color: '#883d52',
    initial: 'P',
    route: 'Manual export',
    requirement:
      'Use the exported draft to create a listing yourself. No automated posting is implemented.',
    docs: 'https://poshmark.com',
  },
  {
    id: 'mercari',
    name: 'Mercari',
    color: '#d34b56',
    initial: 'M',
    route: 'Manual export',
    requirement:
      'Use the exported draft to create a listing yourself. No automated posting is implemented.',
    docs: 'https://www.mercari.com',
  },
  {
    id: 'depop',
    name: 'Depop',
    color: '#da4035',
    initial: 'D',
    route: 'Manual export',
    requirement:
      'Use the exported draft to create a listing yourself. Partner access has not been established.',
    docs: 'https://www.depop.com',
  },
  {
    id: 'facebook',
    name: 'Facebook Marketplace',
    color: '#396fb2',
    initial: 'f',
    route: 'Manual export',
    requirement:
      'Use the exported draft to create a listing yourself. No account or catalog access is connected.',
    docs: 'https://www.facebook.com/marketplace',
  },
  {
    id: 'vinted',
    name: 'Vinted',
    color: '#237b80',
    initial: 'V',
    route: 'Manual export',
    requirement:
      'Use the exported draft to create a listing yourself. No account access is connected.',
    docs: 'https://www.vinted.com',
  },
] as const;
export type MarketplaceId = (typeof marketplaces)[number]['id'];
export type Connection = {
  platform: MarketplaceId;
  status: 'disconnected' | 'connected';
  capabilities: ('draft' | 'publish' | 'reprice' | 'sync')[];
};
export type PublishResult =
  | { ok: true; externalId: string; url: string }
  | { ok: false; code: 'NOT_CONNECTED' | 'UNSUPPORTED' | 'VALIDATION'; message: string };
export interface MarketplaceAdapter {
  connection(): Promise<Connection>;
  publish(draft: Draft, idempotencyKey: string): Promise<PublishResult>;
  updatePrice(externalId: string, price: number, idempotencyKey: string): Promise<PublishResult>;
  sync(): Promise<{ listings: unknown[]; cursor?: string }>;
}
// This contract deliberately fails closed. A real adapter must own OAuth, mappings,
// idempotency, webhook verification and sold-item reconciliation before enabling writes.
export function disconnectedAdapter(platform: MarketplaceId): MarketplaceAdapter {
  const blocked = async (): Promise<PublishResult> => ({
    ok: false,
    code: 'NOT_CONNECTED',
    message: 'No live connection. Export your draft and list manually.',
  });
  return {
    connection: async () => ({ platform, status: 'disconnected', capabilities: ['draft'] }),
    publish: blocked,
    updatePrice: blocked,
    sync: async () => {
      throw new Error('Marketplace is not connected');
    },
  };
}
export function channelSuggestion(
  item: Candidate,
  comps: Comparable[],
  merchant: Merchant,
  platform: string,
  days = 0,
  now = new Date(),
) {
  const channel = comps.filter((c) => c.platform.toLowerCase() === platform.toLowerCase());
  const direct = pricing(item, channel, merchant, now);
  const estimate = direct ?? pricing(item, comps, merchant, now);
  if (!estimate) return null;
  const markdown = Math.min(0.15, Math.max(0, Math.floor((days - 30) / 7)) * 0.03);
  const floor =
    (item.cost +
      item.repair +
      merchant.shipping +
      merchant.handling +
      merchant.fixedFee +
      merchant.targetProfit) /
    (1 - merchant.feePercent / 100);
  const market = estimate.median * (1 - markdown);
  const price = Math.ceil(Math.max(floor, market));
  return {
    price,
    floor,
    market,
    markdown,
    evidence: direct ? `${direct.sold.length} channel sold comps` : 'Blended sold comps',
    aboveMarket: floor > market,
    profit:
      price * (1 - merchant.feePercent / 100) -
      merchant.fixedFee -
      merchant.shipping -
      merchant.handling -
      item.cost -
      item.repair,
  };
}
