'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Check,
  Film,
  History,
  Loader2,
  Plus,
  Sparkles,
  Sliders,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Badge, Card, EmptyState, Eyebrow, Separator } from '@/components/ui/surfaces';
import { formatCents } from '@/lib/money';
import {
  CATEGORY_LABEL,
  UOM_PRECISION,
  UOM_SYMBOL,
  formatBaseQty,
} from '@/lib/uom';
import {
  REEL_PARAMS,
  buildPromoReelPrompt,
} from '@/lib/higgsfield/prompt';
import {
  IS_LOCAL_PREVIEW,
  adjustBatchStock,
  createBatch,
  createMediaJob,
  listCatalogue,
  listMediaJobs,
  listStockMovements,
  updateMediaJob,
} from '@/lib/data/source';
import { useCartelQuery } from '@/lib/data/useCartelQuery';
import { DEFAULT_BRANCH_ID } from '@/lib/demo/fixtures';
import { cn } from '@/lib/utils';
import type { MasterBatchRow, StockMovementType } from '@/types/database';

/**
 * Module F & G — Master Batch Inventory Ledger & Higgsfield AI Promo Studio.
 *
 * 1. Multi-UOM Vault Stock Board (GRAMS, MILLILITERS, UNITS) with FIFO batch
 *    inspection, manual intake/wastage/audit adjustments, and new harvest batch
 *    registration.
 * 2. Immutable Stock Movement Ledger showing every sale, intake, and audit.
 * 3. Higgsfield AI Cinematic Reel Studio: composes luxury obsidian & gold
 *    director prompts (`buildReelPrompt`) and dispatches promo video jobs.
 */

type Tab = 'BATCHES' | 'MOVEMENTS' | 'HIGGSFIELD';
type CameraPreset = 'TURNTABLE_360' | 'MACRO_DRIFT' | 'SLOW_ORBIT';
type LightingPreset = 'OBSIDIAN_RIM' | 'GOLD_CAUSTICS' | 'SURGICAL_DARK';

const CAMERA_PRESET_LABEL: Record<CameraPreset, string> = {
  TURNTABLE_360: '360° Turntable Orbit',
  MACRO_DRIFT: 'Extreme Macro Trichome Drift',
  SLOW_ORBIT: 'Slow Pedestal Push-In',
};

const LIGHTING_PRESET_LABEL: Record<LightingPreset, string> = {
  OBSIDIAN_RIM: 'Obsidian Void + 24K Rim',
  GOLD_CAUSTICS: 'Amber Gold Caustics',
  SURGICAL_DARK: 'High-Contrast Studio Key',
};

const MOVEMENT_TYPES: StockMovementType[] = [
  'INTAKE',
  'WASTE',
  'SPILLAGE',
  'ADJUSTMENT',
  'RETURN',
];

export default function AdminInventoryPage() {
  const [branchId] = useState(DEFAULT_BRANCH_ID);
  const [tab, setTab] = useState<Tab>('BATCHES');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catalogue = useCartelQuery(() => listCatalogue(branchId), [branchId]);
  const movements = useCartelQuery(() => listStockMovements(150), []);
  const mediaJobs = useCartelQuery(() => listMediaJobs(), []);

  // Batch adjustment state
  const [adjustingBatch, setAdjustingBatch] = useState<MasterBatchRow | null>(null);
  const [adjType, setAdjType] = useState<StockMovementType>('INTAKE');
  const [adjQty, setAdjQty] = useState('25');
  const [adjReason, setAdjReason] = useState('Scheduled vault recount / harvest top-up');
  const [adjBusy, setAdjBusy] = useState(false);

  // New batch intake form
  const [newProductId, setNewProductId] = useState('');
  const [newBatchCode, setNewBatchCode] = useState('');
  const [newQty, setNewQty] = useState('250');
  const [newCostCents, setNewCostCents] = useState('6500');
  const [newThc, setNewThc] = useState('28.4');
  const [creatingBatch, setCreatingBatch] = useState(false);

  // Higgsfield studio state
  const [studioProductId, setStudioProductId] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('TURNTABLE_360');
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>('OBSIDIAN_RIM');
  const [directorNote, setDirectorNote] = useState('');
  const [generatingReel, setGeneratingReel] = useState(false);

  const entries = useMemo(() => catalogue.data ?? [], [catalogue.data]);

  const selectedStudioEntry = useMemo(
    () => entries.find((e) => e.product.id === studioProductId) ?? entries[0] ?? null,
    [entries, studioProductId],
  );

  const composedPrompt = useMemo(() => {
    if (!selectedStudioEntry) return '';
    const base = buildPromoReelPrompt({
      productName: selectedStudioEntry.product.name,
      category: selectedStudioEntry.product.category,
      baseUom: selectedStudioEntry.product.base_uom,
      strain: selectedStudioEntry.product.strain,
      thcPct: selectedStudioEntry.product.thc_pct,
      cbdPct: selectedStudioEntry.product.cbd_pct,
      terpeneTags: selectedStudioEntry.product.terpene_tags,
    });
    const extra = [
      `Camera preset: ${CAMERA_PRESET_LABEL[cameraPreset]}.`,
      `Lighting preset: ${LIGHTING_PRESET_LABEL[lightingPreset]}.`,
      directorNote.trim() ? `Director note: ${directorNote.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `${base} ${extra}`.trim();
  }, [selectedStudioEntry, cameraPreset, lightingPreset, directorNote]);

  const submitAdjustment = useCallback(async () => {
    if (!adjustingBatch) return;
    const qty = Number.parseFloat(adjQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Enter a valid positive quantity.');
      return;
    }
    setAdjBusy(true);
    setError(null);
    try {
      await adjustBatchStock({
        batchId: adjustingBatch.id,
        movementType: adjType,
        baseQty: qty,
        reason: adjReason.trim() || 'Vault adjustment',
      });
      setNotice(`Adjusted ${adjustingBatch.batch_code} (${adjType} ${qty}).`);
      setAdjustingBatch(null);
      catalogue.refresh();
      movements.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock adjustment failed.');
    } finally {
      setAdjBusy(false);
    }
  }, [adjustingBatch, adjQty, adjType, adjReason, catalogue, movements]);

  const handleCreateBatch = useCallback(async () => {
    const targetProductId = newProductId || entries[0]?.product.id;
    if (!targetProductId || !newBatchCode.trim()) {
      setError('Provide a product and unique batch code.');
      return;
    }
    setCreatingBatch(true);
    setError(null);
    try {
      const batch = await createBatch({
        productId: targetProductId,
        branchId,
        batchCode: newBatchCode.trim().toUpperCase(),
        receivedBaseQty: Number.parseFloat(newQty) || 100,
        costPerBaseUnitCents: Number.parseInt(newCostCents, 10) || 5000,
        lowStockThreshold: 25,
        thcPct: Number.parseFloat(newThc) || null,
        cbdPct: 0.4,
        terpeneProfile: { Limonene: 1.1, Caryophyllene: 0.8 },
        harvestDate: new Date().toISOString().slice(0, 10),
        expiryDate: null,
      });
      setNotice(`Created master batch ${batch.batch_code}.`);
      setNewBatchCode('');
      catalogue.refresh();
      movements.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create batch.');
    } finally {
      setCreatingBatch(false);
    }
  }, [newProductId, entries, newBatchCode, newQty, newCostCents, newThc, branchId, catalogue, movements]);

  const handleGenerateReel = useCallback(async () => {
    if (!selectedStudioEntry) return;
    setGeneratingReel(true);
    setError(null);
    try {
      const job = await createMediaJob({
        productId: selectedStudioEntry.product.id,
        prompt: composedPrompt,
        kind: 'PROMO_REEL',
        params: {
          ...REEL_PARAMS.PROMO_REEL,
          camera: cameraPreset,
          lighting: lightingPreset,
        },
      });

      if (IS_LOCAL_PREVIEW) {
        // Complete with a preview synthesis record so the operator sees the full lifecycle
        await updateMediaJob(job.id, {
          status: 'COMPLETED',
          duration_seconds: 5,
          completed_at: new Date().toISOString(),
        });
      }

      setNotice(
        `Dispatched Higgsfield reel job for ${selectedStudioEntry.product.name} (${CAMERA_PRESET_LABEL[cameraPreset]}).`,
      );
      mediaJobs.refresh();
      catalogue.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not queue Higgsfield reel.');
    } finally {
      setGeneratingReel(false);
    }
  }, [selectedStudioEntry, composedPrompt, cameraPreset, lightingPreset, mediaJobs, catalogue]);

  return (
    <main className="min-h-screen bg-void pb-28 pt-12">
      <div className="container">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Back Office · Module F & G</Eyebrow>
            <h1 className="mt-2 display-md text-white">
              Vault <span className="gold-text">Inventory</span> & Higgsfield
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Master batch balances in base units (g, ml, units), immutable FIFO movement ledger,
              and Higgsfield AI 9:16 product reel synthesis.
            </p>
          </div>

          <div className="flex gap-2">
            {(
              [
                ['BATCHES', 'Master Batches', Boxes],
                ['MOVEMENTS', 'Movement Ledger', History],
                ['HIGGSFIELD', 'Higgsfield AI Studio', Film],
              ] as const
            ).map(([key, label, Icon]) => (
              <Button
                key={key}
                variant={tab === key ? 'active' : 'surface'}
                size="sm"
                onClick={() => setTab(key)}
              >
                <Icon className="size-3.5" />
                {label}
              </Button>
            ))}
          </div>
        </header>

        {notice ? (
          <p className="mt-6 border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 font-mono text-xs text-emerald-300">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-6 border border-destructive/60 bg-destructive/10 px-4 py-3 font-mono text-xs text-red-300">
            {error}
          </p>
        ) : null}

        {/* TAB 1: MASTER BATCHES */}
        {tab === 'BATCHES' ? (
          <div className="mt-8 space-y-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {entries.map(({ product, batches, stock }) => (
                <Card key={product.id} className="flex flex-col justify-between gap-4 p-5">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-faint">
                          {product.sku} · {CATEGORY_LABEL[product.category]}
                        </span>
                        <h2 className="mt-1 font-display text-lg uppercase text-white">
                          {product.name}
                        </h2>
                      </div>
                      {stock.is_low_stock ? (
                        <Badge tone="warn">
                          <AlertTriangle className="size-3" />
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge tone="live">In Stock</Badge>
                      )}
                    </div>

                    <div className="mt-4 flex items-baseline justify-between border border-[color:var(--border-mono)] bg-void p-3 font-mono">
                      <span className="text-[0.625rem] uppercase tracking-[0.2em] text-faint">
                        Available ({product.base_uom})
                      </span>
                      <span className="text-lg tabular-nums text-gold">
                        {stock.available_base_qty.toFixed(UOM_PRECISION[product.base_uom])}{' '}
                        {UOM_SYMBOL[product.base_uom]}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      <span className="font-mono text-[0.5625rem] uppercase tracking-[0.22em] text-faint">
                        Active FIFO Batches ({batches.length})
                      </span>
                      {batches.map((batch) => (
                        <div
                          key={batch.id}
                          className="flex items-center justify-between border border-[color:var(--border-mono)] px-3 py-2 font-mono text-xs"
                        >
                          <div>
                            <p className="text-white">{batch.batch_code}</p>
                            <p className="text-[0.625rem] text-muted-foreground">
                              {formatBaseQty(batch.remaining_base_qty, product.base_uom)} /{' '}
                              {formatBaseQty(batch.received_base_qty, product.base_uom)} · Cost{' '}
                              {formatCents(batch.cost_per_base_unit_cents)}/
                              {UOM_SYMBOL[product.base_uom]}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAdjustingBatch(batch)}
                          >
                            <Sliders className="size-3" />
                            Adjust
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* New Harvest Batch Intake Card */}
            <Card className="space-y-5 p-6">
              <div>
                <Eyebrow>Harvest & Lab Intake</Eyebrow>
                <h2 className="mt-1 font-display text-lg uppercase text-white">
                  Receive New Master Batch
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-5">
                <Field label="Product" htmlFor="nb_product">
                  <select
                    id="nb_product"
                    value={newProductId || entries[0]?.product.id || ''}
                    onChange={(e) => setNewProductId(e.target.value)}
                    className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono text-xs text-white"
                  >
                    {entries.map((e) => (
                      <option key={e.product.id} value={e.product.id}>
                        {e.product.name} ({UOM_SYMBOL[e.product.base_uom]})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Batch Code" htmlFor="nb_code">
                  <Input
                    id="nb_code"
                    value={newBatchCode}
                    onChange={(e) => setNewBatchCode(e.target.value.toUpperCase())}
                    placeholder="JHB-SOV-2612A"
                    className="font-mono"
                  />
                </Field>
                <Field label="Received Base Qty" htmlFor="nb_qty">
                  <Input
                    id="nb_qty"
                    type="number"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    className="font-mono"
                  />
                </Field>
                <Field label="Unit Cost (cents)" htmlFor="nb_cost">
                  <Input
                    id="nb_cost"
                    type="number"
                    value={newCostCents}
                    onChange={(e) => setNewCostCents(e.target.value)}
                    className="font-mono"
                  />
                </Field>
                <Field label="Lab THC %" htmlFor="nb_thc">
                  <Input
                    id="nb_thc"
                    type="number"
                    step="0.1"
                    value={newThc}
                    onChange={(e) => setNewThc(e.target.value)}
                    className="font-mono"
                  />
                </Field>
              </div>
              <Button
                variant="gold"
                disabled={creatingBatch || !newBatchCode.trim()}
                onClick={() => void handleCreateBatch()}
              >
                {creatingBatch ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Log Harvest Batch into Vault
              </Button>
            </Card>
          </div>
        ) : null}

        {/* TAB 2: MOVEMENT LEDGER */}
        {tab === 'MOVEMENTS' ? (
          <Card className="mt-8 overflow-hidden">
            <div className="border-b border-[color:var(--border-mono)] px-5 py-4">
              <Eyebrow>Immutable Stock Audit Trail</Eyebrow>
            </div>
            {(movements.data ?? []).length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="No stock movements recorded yet"
                  description="Ring up a POS sale, complete an online allocation, or adjust a batch to populate the ledger."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="border-b border-[color:var(--border-mono)] bg-void text-[0.625rem] uppercase tracking-[0.2em] text-faint">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Delta</th>
                      <th className="px-4 py-3">Balance After</th>
                      <th className="px-4 py-3">Reason / Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--border-mono)]">
                    {(movements.data ?? []).map((m) => (
                      <tr key={m.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(m.created_at).toLocaleTimeString('en-ZA', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={m.base_qty_delta >= 0 ? 'live' : 'gold'}>
                            {m.movement_type}
                          </Badge>
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 tabular-nums',
                            m.base_qty_delta >= 0 ? 'text-emerald-300' : 'text-amber-300',
                          )}
                        >
                          {m.base_qty_delta >= 0 ? '+' : ''}
                          {formatBaseQty(m.base_qty_delta, m.base_uom)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-white">
                          {formatBaseQty(m.balance_after, m.base_uom)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{m.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        ) : null}

        {/* TAB 3: HIGGSFIELD AI STUDIO */}
        {tab === 'HIGGSFIELD' ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-12">
            <Card className="space-y-5 p-6 lg:col-span-7">
              <div>
                <Eyebrow>Automated Promo Media Pipeline</Eyebrow>
                <h2 className="mt-1 font-display text-xl uppercase text-white">
                  Higgsfield <span className="gold-text">9:16 Reel Director</span>
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Synthesizes macro trichome and obsidian-gold product reels for the dispensary
                  hover cards.
                </p>
              </div>

              <Field label="Target Product" htmlFor="hf_product">
                <select
                  id="hf_product"
                  value={selectedStudioEntry?.product.id ?? ''}
                  onChange={(e) => setStudioProductId(e.target.value)}
                  className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono text-xs text-white"
                >
                  {entries.map((e) => (
                    <option key={e.product.id} value={e.product.id}>
                      {e.product.name} ({CATEGORY_LABEL[e.product.category]})
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Camera Motion Preset" htmlFor="hf_cam">
                  <select
                    id="hf_cam"
                    value={cameraPreset}
                    onChange={(e) => setCameraPreset(e.target.value as CameraPreset)}
                    className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono text-xs text-white"
                  >
                    {(Object.keys(CAMERA_PRESET_LABEL) as CameraPreset[]).map((preset) => (
                      <option key={preset} value={preset}>
                        {CAMERA_PRESET_LABEL[preset]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Lighting Preset" htmlFor="hf_light">
                  <select
                    id="hf_light"
                    value={lightingPreset}
                    onChange={(e) => setLightingPreset(e.target.value as LightingPreset)}
                    className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono text-xs text-white"
                  >
                    {(Object.keys(LIGHTING_PRESET_LABEL) as LightingPreset[]).map((preset) => (
                      <option key={preset} value={preset}>
                        {LIGHTING_PRESET_LABEL[preset]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Director Override Note (Optional)" htmlFor="hf_note">
                <Input
                  id="hf_note"
                  value={directorNote}
                  onChange={(e) => setDirectorNote(e.target.value)}
                  placeholder="Slow-motion gold leaf particles drifting across the jar..."
                />
              </Field>

              <Field label="Compiled Higgsfield Prompt" htmlFor="hf_compiled">
                <Textarea
                  id="hf_compiled"
                  rows={5}
                  readOnly
                  value={composedPrompt}
                  className="font-mono text-xs text-gold"
                />
              </Field>

              <Button
                variant="gold"
                size="lg"
                disabled={generatingReel || !selectedStudioEntry}
                onClick={() => void handleGenerateReel()}
              >
                {generatingReel ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {generatingReel ? 'Dispatching to Higgsfield...' : 'Generate 9:16 Luxury Promo Reel'}
              </Button>
            </Card>

            <Card className="space-y-4 p-6 lg:col-span-5">
              <div className="flex items-center justify-between">
                <Eyebrow>Media Job Queue</Eyebrow>
                <Badge tone="gold">{(mediaJobs.data ?? []).length} Jobs</Badge>
              </div>

              <Separator />

              {(mediaJobs.data ?? []).length === 0 ? (
                <EmptyState
                  title="No media jobs queued"
                  description="Select a product and click Generate to synthesize a 9:16 promo reel."
                />
              ) : (
                <ul className="space-y-3">
                  {(mediaJobs.data ?? []).map((job) => (
                    <li
                      key={job.id}
                      className="border border-[color:var(--border-mono)] bg-void p-3.5 font-mono text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-white">
                          <Video className="size-3.5 text-gold" />
                          {job.kind}
                        </span>
                        <Badge tone={job.status === 'COMPLETED' ? 'live' : 'gold'}>
                          {job.status}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[0.6875rem] text-muted-foreground">
                        {job.prompt}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        ) : null}
      </div>

      {/* Batch Adjustment Modal */}
      {adjustingBatch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md space-y-4 border-gold p-6">
            <Eyebrow>Batch Balance Adjustment</Eyebrow>
            <h3 className="font-display text-lg uppercase text-white">
              {adjustingBatch.batch_code}
            </h3>

            <Field label="Movement Type" htmlFor="adj_type">
              <select
                id="adj_type"
                value={adjType}
                onChange={(e) => setAdjType(e.target.value as StockMovementType)}
                className="h-11 w-full border border-[color:var(--border-subtle)] bg-surface px-3 font-mono text-xs text-white"
              >
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Base Quantity" htmlFor="adj_qty">
              <Input
                id="adj_qty"
                type="number"
                step="0.5"
                value={adjQty}
                onChange={(e) => setAdjQty(e.target.value)}
                className="font-mono"
              />
            </Field>

            <Field label="Audit Reason" htmlFor="adj_reason">
              <Input
                id="adj_reason"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setAdjustingBatch(null)}>
                Cancel
              </Button>
              <Button variant="gold" disabled={adjBusy} onClick={() => void submitAdjustment()}>
                {adjBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Commit Adjustment
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
