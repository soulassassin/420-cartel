import Image from 'next/image';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { TierSelector } from './TierSelector';
import { Badge, Card, Stat } from '@/components/ui/surfaces';
import { formatCents } from '@/lib/money';
import { CATEGORY_LABEL, UOM_SYMBOL } from '@/lib/uom';
import { entryPriceCents, type CatalogueProduct } from '@/lib/data/catalogue';

/**
 * Catalogue card.
 *
 * Two states, decided by whether the viewer resolved any variants at all:
 * a verified member gets the full tier picker; everyone else gets the product
 * story with the pricing block replaced by the gate. The gate is enforced by
 * RLS, so `variants.length === 0` for a signed-out visitor is not a guess.
 */
export function ProductCard({
  product,
  gated,
}: {
  product: CatalogueProduct;
  gated: boolean;
}) {
  const entry = entryPriceCents(product);
  const available = product.stock?.available_base_qty ?? 0;
  const soldOut = !gated && available <= 0;

  return (
    <Card className="group flex flex-col overflow-hidden">
      {/* ---- Media ------------------------------------------------------- */}
      <Link
        href={`/shop/${product.slug}`}
        className="relative block aspect-[4/5] overflow-hidden bg-void"
      >
        {product.hero_media_url ? (
          <Image
            src={product.hero_media_url}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="tile-media object-cover"
          />
        ) : (
          <div className="absolute inset-0 " />
        )}

        {/* Gradient so white type stays legible over any render. */}
        <div className="absolute inset-0 " />

        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <Badge tone="mono">{CATEGORY_LABEL[product.category]}</Badge>
          {product.strain !== 'NOT_APPLICABLE' ? (
            <Badge tone="mono">{product.strain}</Badge>
          ) : null}
          {soldOut ? <Badge tone="danger">Sold Out</Badge> : null}
          {product.stock?.is_low_stock && !soldOut ? <Badge tone="warn">Low</Badge> : null}
        </div>

        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3">
          <h3 className="font-display text-xl font-bold uppercase leading-none ">
            {product.name}
          </h3>
          <span className="shrink-0 font-mono type-ui text-foreground">
            {UOM_SYMBOL[product.base_uom]}
          </span>
        </div>
      </Link>

      {/* ---- Body -------------------------------------------------------- */}
      <div className="flex flex-1 flex-col gap-5 p-5">
        {product.short_tagline ? (
          <p className="type-ui leading-relaxed text-ash">{product.short_tagline}</p>
        ) : null}

        {/* Lab stats — always visible, they are the brand story not the price. */}
        {product.thc_pct !== null || product.cbd_pct !== null || product.extraction_purity_pct !== null ? (
          <div className="grid grid-cols-3 gap-3 border-y border-hairline py-4">
            {product.thc_pct !== null ? (
              <Stat label="THC" value={product.thc_pct.toFixed(1)} unit="%" tone="gold" />
            ) : null}
            {product.cbd_pct !== null ? (
              <Stat label="CBD" value={product.cbd_pct.toFixed(1)} unit="%" />
            ) : null}
            {product.extraction_purity_pct !== null ? (
              <Stat label="Purity" value={product.extraction_purity_pct.toFixed(1)} unit="%" />
            ) : null}
          </div>
        ) : null}

        {product.terpene_tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {product.terpene_tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="border border-[color:var(--border-mono)] px-2 py-0.5 font-mono type-ui text-ash"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {/* ---- Pricing / gate -------------------------------------------- */}
        <div className="mt-auto">
          {gated ? (
            <Link
              href="/onboarding"
              className="flex items-center justify-between gap-3 border border-dashed border-ash px-4 py-3 hover:border-foreground hover:bg-transparent transition-colors"
            >
              <span className="flex items-center gap-2 font-mono type-ui text-foreground">
                <Lock className="size-3" />
                Members Only
              </span>
              <span className="font-mono type-ui text-ash">
                Unlock Pricing
              </span>
            </Link>
          ) : (
            <TierSelector
              productId={product.id}
              productName={product.name}
              productSlug={product.slug}
              category={product.category}
              baseUom={product.base_uom}
              variants={product.variants}
              availableBaseQty={available}
              heroMediaUrl={product.hero_media_url}
            />
          )}
        </div>

        {gated && entry !== null ? (
          <p className="font-mono type-ui text-ash">
            From {formatCents(entry)}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
