import { z } from 'zod';
import { discoverySchema } from './discovery';
export const categories = ['Clothing', 'Home', 'Electronics', 'Collectibles', 'Pet gear'] as const;
export const conditionNames = ['Excellent', 'Good', 'Fair', 'Poor'] as const;
export const moneySchema = z.number().finite().min(0).max(1000000);
export const candidateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(60),
  category: z.enum(categories),
  size: z.string().trim().max(40),
  color: z.string().trim().max(40),
  theme: z.string().trim().max(60),
  condition: z.enum(conditionNames),
  cost: moneySchema,
  repair: moneySchema,
  store: z.string().trim().max(100),
  notes: z.string().max(1000),
  reviewed: z.boolean(),
});
export type Candidate = z.infer<typeof candidateSchema>;
export const profileSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(60),
  kind: z.enum(['Adult', 'Child', 'Pet']),
  size: z.string().max(40),
  colors: z.string().max(80),
  notes: z.string().max(200),
});
export type Profile = z.infer<typeof profileSchema>;
export const goalSchema = z.object({
  id: z.string(),
  personId: z.string(),
  title: z.string().trim().min(1).max(100),
  category: z.enum(categories),
  size: z.string().max(40),
  color: z.string().max(40),
  theme: z.string().max(60),
  budget: moneySchema,
  purpose: z.string().max(200),
  priority: z.enum(['Soon', 'Whenever']),
  fulfilled: z.boolean(),
});
export type Goal = z.infer<typeof goalSchema>;
export const compSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string().min(1).max(120),
  platform: z.string().min(1).max(40),
  price: moneySchema,
  kind: z.enum(['sold', 'asking']),
  date: z.iso.date(),
  source: z.enum(['demo', 'manual']),
  url: z.string().max(1000),
  condition: z.enum(conditionNames),
});
export type Comparable = z.infer<typeof compSchema>;
export const itemSchema = candidateSchema.extend({
  id: z.string(),
  added: z.iso.datetime(),
  ownerId: z.string(),
  mode: z.enum(['household', 'merchant']),
  status: z.enum(['Owned', 'In stock', 'Sold']),
  evidence: z.enum(['demo', 'manual', 'google', 'azure']),
});
export type InventoryItem = z.infer<typeof itemSchema>;
export const saleSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  title: z.string(),
  category: z.enum(categories),
  store: z.string(),
  cost: moneySchema,
  soldFor: moneySchema,
  expenses: moneySchema,
  date: z.iso.date(),
  demo: z.boolean(),
});
export type Sale = z.infer<typeof saleSchema>;
export const merchantSchema = z.object({
  name: z.string().trim().min(1).max(80),
  niche: z.enum(categories),
  sourceStore: z.string().max(100),
  targetProfit: moneySchema,
  shipping: moneySchema,
  handling: moneySchema,
  minMargin: z.number().min(0).max(100),
  feePercent: z.number().min(0).max(50),
  fixedFee: moneySchema,
});
export type Merchant = z.infer<typeof merchantSchema>;
export const draftSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  platform: z.string(),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(4000),
  price: moneySchema,
  updated: z.iso.datetime(),
});
export type Draft = z.infer<typeof draftSchema>;
export const stateSchema = z.object({
  version: z.literal(1),
  discovery: discoverySchema,
  profiles: z.array(profileSchema).max(100),
  goals: z.array(goalSchema).max(1000),
  inventory: z.array(itemSchema).max(5000),
  comps: z.array(compSchema).max(10000),
  sales: z.array(saleSchema).max(5000),
  merchant: merchantSchema,
  drafts: z.array(draftSchema).max(5000),
});
export type AppState = z.infer<typeof stateSchema>;
export type Evidence = InventoryItem['evidence'];
export type Identification = {
  provider: Evidence;
  configured: boolean;
  message: string;
  labels: string[];
  text: string;
  confidence: number | null;
  suggestion: string;
};
export const itemKey = (item: Pick<Candidate, 'title' | 'brand' | 'category' | 'size'>) =>
  [item.category, item.brand, item.title, item.size].map((x) => x.trim().toLowerCase()).join('|');
export const dollars = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
export const today = () => new Date().toISOString().slice(0, 10);
export const uid = () => crypto.randomUUID();
