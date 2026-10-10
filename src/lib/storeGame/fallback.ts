import type { CategoryNode } from './types';

/** Shops to build when /api/categories can't be reached (e.g. CORS from localhost). */
export const FALLBACK_CATEGORIES: CategoryNode[] = [
  { slug: 'groceries', name: 'Groceries', productCount: 900 },
  { slug: 'books', name: 'Books', productCount: 992 },
  { slug: 'drinks', name: 'Drinks', productCount: 400 },
  { slug: 'personal-care', name: 'Personal Care', productCount: 300 },
  { slug: 'home-essentials', name: 'Home Essentials', productCount: 250 },
  { slug: 'snacks', name: 'Snacks', productCount: 200 },
  { slug: 'fashion', name: 'Fashion', productCount: 180 },
  { slug: 'baby', name: 'Baby', productCount: 120 },
  { slug: 'art-collectibles', name: 'Art & Collectibles', productCount: 90 },
  { slug: 'electronics', name: 'Electronics', productCount: 80 },
];
