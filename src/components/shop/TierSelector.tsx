'use client';

import { useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/ui/field';
import { Badge } from '@/components/ui/surfaces';
import { formatCents } from '@/lib/money';
import {
  UOM_SYMBOL,
  formatBaseQty,
  pricePerBaseUnitCents,
  tiersAvailable,
  validateCustomAmount,
} from '@/lib/uom';
import { useCartStore } from '@/lib/store/cart';
import { cn } from '@/lib/utils';
import type { BaseUom, ProductCategory, ProductVariantRow } from '@/types/database';

/**
 * Tier picker: the one control that handles grams, millilitres and units.
 *
 * A fixed tier adds `variant_id + quantity`. A custom tier adds the same plus
 * `base_qty_override`, and prices off the variant's per-base-unit rate. The
 * server recomputes both from the variant row, so a tampered price here is
 * ignored — this is a display and intent surface only.
 */
export function TierSelector({
  productId,
  productName,
  productSlug,
  category,
  baseUom,
  variants,
  availableBaseQty,
  heroMediaUrl,
}: {
  productId: string;
  productName: string;
  productSlug: string;
  category: ProductCategory;
  baseUom: BaseUom;
  variants: ProductVariantRow[];
  availableBaseQty: number;
  heroMediaUrl: string | null;
}) {
  const addLine = useCartStore((state) => state.addLine);

  const fixedTiers = useMemo(
    () => variants.filter((variant) => !variant.is_custom_amount),
    [variants],
  );
  const customTier = useMemo(
    () => variants.find((variant) => variant.is_custom_amount) ?? null,
    [variants],
  );

  const [selectedId, setSelectedId] = useState<string | null>(fixedTiers[0]?.id ?? null);
  const [customRaw, setCustomRaw] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const usingCustom = selectedId === customTier?.id;
  const selected = variants.find((variant) => variant.id === selectedId) ?? null;

  const customAmount = Number(customRaw.replace(',', '.'));
  const customValid =
    customTier !== null &&
    customRaw.trim() !== '' &&
    validateCustomAmount(customAmount, baseUom, customTier.base_quantity).ok;

  const effectiveBaseQty = usingCustom
    ? customValid
      ? customAmount
      : 0
    : (selected?.base_quantity ?? 0);

  const effectivePriceCents = !selected
    ? 0
    : usingCustom
      ? Math.round(selected.price_cents * effectiveBaseQty)
      : selected.price_cents;

  const inStock = effectiveBaseQty > 0 && availableBaseQty >= effectiveBaseQty;
  const canAdd = Boolean(selected) && inStock && (!usingCustom || customValid);

  function onAdd() {
    if (!selected || !canAdd) return;

    if (usingCustom && customTier) {
      const check = validateCustomAmount(customAmount, baseUom, customTier.base_quantity);
      if (!check.ok) {
        setCustomError(check.error);
        return;
      }
    }

    addLine({
      productId,
      productName,
      productSlug,
      category,
      variantId: selected.id,
      variantLabel: usingCustom ? formatBaseQty(effectiveBaseQty, baseUom) : selected.label,
      baseUom,
      baseQuantity: selected.base_quantity,
      customBaseQty: usingCustom ? effectiveBaseQty : null,
      quantity: 1,
      unitPriceCents: selected.price_cents,
      heroMediaUrl,
    });

    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  if (variants.length === 0) {
    return (
      <p className="font-mono type-ui text-ash">
        Pricing visible to verified members
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Fixed tiers ------------------------------------------------- */}
      <div className="flex flex-wrap gap-2">
        {fixedTiers.map((variant) => {
          const fillable = availableBaseQty >= variant.base_quantity;
          const active = variant.id === selectedId;
          return (
            <button
              key={variant.id}
              type="button"
              disabled={!fillable}
              onClick={() => {
                setSelectedId(variant.id);
                setCustomError(null);
              }}
              aria-pressed={active}
              className={cn(
                'flex min-w-[4.5rem] flex-col items-center gap-0.5 border px-3 py-2 ',
                active
                  ? 'border-foreground bg-transparent text-foreground '
                  : 'border-[color:var(--border-mono)] text-foreground hover:border-ash',
                !fillable && 'cursor-not-allowed opacity-30',
              )}
            >
              <span className="font-mono type-ui tabular-nums">{variant.label}</span>
              <span className="font-mono type-ui tabular-nums text-ash">
                {formatCents(variant.price_cents)}
              </span>
            </button>
          );
        })}

        {customTier ? (
          <button
            type="button"
            onClick={() => {
              setSelectedId(customTier.id);
              setCustomError(null);
            }}
            aria-pressed={usingCustom}
            className={cn(
              'flex min-w-[4.5rem] flex-col items-center gap-0.5 border px-3 py-2 ',
              usingCustom
                ? 'border-foreground bg-transparent text-foreground '
                : 'border-dashed border-[color:var(--border-mono)] text-ash hover:border-ash',
            )}
          >
            <span className="font-mono type-ui">Custom</span>
            <span className="font-mono type-ui text-ash">
              {UOM_SYMBOL[baseUom]}
            </span>
          </button>
        ) : null}
      </div>

      {/* ---- Custom amount entry ----------------------------------------- */}
      {usingCustom && customTier ? (
        <div className="flex flex-col gap-2">
          <NumericInput
            value={customRaw}
            onChange={(event) => {
              setCustomRaw(event.target.value.replace(/[^0-9.,]/g, ''));
              setCustomError(null);
            }}
            suffix={UOM_SYMBOL[baseUom]}
            placeholder={String(customTier.base_quantity)}
            aria-label={`Custom amount in ${UOM_SYMBOL[baseUom]}`}
            aria-invalid={Boolean(customError)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono type-ui text-ash">
              Min {formatBaseQty(customTier.base_quantity, baseUom)} ·{' '}
              {formatCents(pricePerBaseUnitCents(customTier.price_cents, 1))}/
              {UOM_SYMBOL[baseUom]}
            </span>
            {customValid ? (
              <span className="font-mono type-ui tabular-nums text-foreground">
                {formatCents(effectivePriceCents)}
              </span>
            ) : null}
          </div>
          {customError ? (
            <p role="alert" className="font-mono type-ui text-foreground">
              {customError}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ---- Availability + add ------------------------------------------ */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          {availableBaseQty <= 0 ? (
            <Badge tone="danger">Sold Out</Badge>
          ) : !inStock && effectiveBaseQty > 0 ? (
            <Badge tone="warn">
              Only {formatBaseQty(availableBaseQty, baseUom)} left
            </Badge>
          ) : baseUom !== 'UNITS' && selected ? (
            <span className="font-mono type-ui text-ash">
              {tiersAvailable(availableBaseQty, effectiveBaseQty || selected.base_quantity)} ×{' '}
              {usingCustom ? formatBaseQty(effectiveBaseQty, baseUom) : selected.label} available
            </span>
          ) : (
            <span className="font-mono type-ui text-ash">
              {formatBaseQty(availableBaseQty, baseUom)} in stock
            </span>
          )}
        </div>

        <Button
          type="button"
          variant={added ? 'active' : 'gold'}
          size="default"
          onClick={onAdd}
          disabled={!canAdd}
        >
          {added ? (
            <>
              <Check />
              Added
            </>
          ) : (
            <>
              <Plus />
              {effectivePriceCents > 0 ? formatCents(effectivePriceCents) : 'Add'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
