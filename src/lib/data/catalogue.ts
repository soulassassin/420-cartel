import 'server-only';

import { createCartelServerClient } from '@/lib/supabase/server';
import type {
  BranchRow,
  ProductCategory,
  ProductRow,
  ProductStockLevelRow,
  ProductVariantRow,
} from '@/types/database';

/**
 * Catalogue reads.
 *
 * Pricing lives on `product_variants`, whose RLS policy only resolves for
 * verified members and staff. That is what makes the gate real: a signed-out
 * visitor gets the product story with an empty `variants` array, so there is no
 * code path where an unverified visitor can be shown a price.
 */

export interface CatalogueProduct extends ProductRow {
  variants: ProductVariantRow[];
  stock: ProductStockLevelRow | null;
}

function sortVariants(variants: ProductVariantRow[]): ProductVariantRow[] {
  return [...variants].sort(
    (a, b) => a.sort_order - b.sort_order || a.base_quantity - b.base_quantity,
  );
}

export async function getBranches(): Promise<BranchRow[]> {
  const supabase = await createCartelServerClient();
  const { data } = await supabase
    .from('branches')
    .select('*')
    .eq('is_active', true)
    .order('name');
  return data ?? [];
}

export async function getDefaultBranch(): Promise<BranchRow | null> {
  const branches = await getBranches();
  const slug = process.env.CARTEL_DEFAULT_BRANCH_SLUG;
  if (slug) {
    const preferred = branches.find((branch) => branch.slug.toLowerCase() === slug.toLowerCase());
    if (preferred) return preferred;
  }
  return branches[0] ?? null;
}

/** Full catalogue for a branch, with per-branch availability folded in. */
export async function getCatalogue(
  branchId: string | null,
  options: { category?: ProductCategory | null; search?: string | null } = {},
): Promise<CatalogueProduct[]> {
  const supabase = await createCartelServerClient();

  let query = supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');

  if (options.category) query = query.eq('category', options.category);
  if (options.search) {
    const term = options.search.trim();
    if (term.length > 0) {
      // Name or SKU, case-insensitive.
      query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
    }
  }

  const { data: productRows, error } = await query;
  if (error || !productRows) return [];

  // Stock levels come from the aggregate view, scoped to the branch.
  const stockByProduct = new Map<string, ProductStockLevelRow>();
  if (branchId) {
    const { data: stockRows } = await supabase
      .from('product_stock_levels')
      .select('*')
      .eq('branch_id', branchId);
    for (const row of stockRows ?? []) {
      stockByProduct.set(row.product_id, row);
    }
  }

  type JoinedProduct = ProductRow & { product_variants: ProductVariantRow[] | null };

  return (productRows as unknown as JoinedProduct[]).map((row) => {
    const { product_variants, ...product } = row;
    return {
      ...product,
      variants: sortVariants((product_variants ?? []).filter((variant) => variant.is_active)),
      stock: stockByProduct.get(product.id) ?? null,
    };
  });
}

export async function getProductBySlug(
  slug: string,
  branchId: string | null,
): Promise<CatalogueProduct | null> {
  const supabase = await createCartelServerClient();

  const { data, error } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  type JoinedProduct = ProductRow & { product_variants: ProductVariantRow[] | null };
  const { product_variants, ...product } = data as unknown as JoinedProduct;

  let stock: ProductStockLevelRow | null = null;
  if (branchId) {
    const { data: stockRow } = await supabase
      .from('product_stock_levels')
      .select('*')
      .eq('product_id', product.id)
      .eq('branch_id', branchId)
      .maybeSingle();
    stock = stockRow ?? null;
  }

  return {
    ...product,
    variants: sortVariants((product_variants ?? []).filter((variant) => variant.is_active)),
    stock,
  };
}

/** Categories that actually have stocked, active products at this branch. */
export async function getStockedCategories(branchId: string | null): Promise<ProductCategory[]> {
  const catalogue = await getCatalogue(branchId);
  const seen = new Set<ProductCategory>();
  for (const product of catalogue) {
    if (!branchId || (product.stock && product.stock.available_base_qty > 0)) {
      seen.add(product.category);
    }
  }
  return [...seen];
}

export async function getActiveLoyaltyRules() {
  const supabase = await createCartelServerClient();
  const { data } = await supabase
    .from('loyalty_rules')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Cheapest variant price, used for the gated "from R—" teaser. */
export function entryPriceCents(product: CatalogueProduct): number | null {
  if (product.variants.length === 0) return null;
  return product.variants.reduce(
    (lowest, variant) => Math.min(lowest, variant.price_cents),
    Number.POSITIVE_INFINITY,
  );
}

/** Is this tier fillable from on-hand stock at the active branch? */
export function tierInStock(product: CatalogueProduct, variant: ProductVariantRow): boolean {
  if (!product.stock) return false;
  return product.stock.available_base_qty >= variant.base_quantity;
}
