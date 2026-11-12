'use client';

import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Plus, Tags, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Card, Eyebrow } from '@/components/ui/surfaces';
import { createCategory, deleteCategory, type CatalogueEntry } from '@/lib/data/source';
import {
  exportStockWorkbook,
  importStockWorkbook,
  type StockImportSummary,
} from '@/lib/inventory/stock-sheet';
import { CATEGORY_LABEL } from '@/lib/uom';
import type { CatalogueCategoryRow, ProductCategory } from '@/types/database';

/**
 * Inventory tools above the stock board:
 *
 *  - Categories: add and remove shelf categories (flower grades such as
 *    Greenhouse, Indoor, Hydro). The POS filter row follows this list.
 *  - Spreadsheet: export the selected branch's stock to Excel, and import an
 *    edited copy to post stock counts and add new products in bulk.
 */

const PRODUCT_TYPES = Object.keys(CATEGORY_LABEL) as ProductCategory[];

export function CatalogueTools({
  branchId,
  branchName,
  entries,
  categories,
  onChanged,
  onNotice,
  onError,
}: {
  branchId: string;
  branchName: string;
  entries: CatalogueEntry[];
  categories: CatalogueCategoryRow[];
  /** Refetch catalogue, categories and the movement ledger. */
  onChanged: () => void;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ProductCategory>('FLOWER');
  const [busy, setBusy] = useState<'ADD' | 'EXPORT' | 'IMPORT' | string | null>(null);
  const [summary, setSummary] = useState<StockImportSummary | null>(null);

  const productCount = (categoryId: string) =>
    entries.filter((entry) => entry.product.category_id === categoryId).length;

  const run = async (key: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    onError(null);
    try {
      await work();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const addCategory = () =>
    run('ADD', async () => {
      const created = await createCategory(newName, newType);
      setNewName('');
      onNotice(`Added category ${created.name}. It is now available on the POS.`);
      onChanged();
    });

  const removeCategory = (category: CatalogueCategoryRow) =>
    run(category.id, async () => {
      const count = productCount(category.id);
      await deleteCategory(category.id);
      onNotice(
        count > 0
          ? `Removed category ${category.name}. Its ${count} product${count === 1 ? ' is' : 's are'} now uncategorised.`
          : `Removed category ${category.name}.`,
      );
      onChanged();
    });

  const exportSheet = () =>
    run('EXPORT', async () => {
      await exportStockWorkbook({ entries, categories, branchName });
      onNotice(`Exported ${entries.length} products for ${branchName}.`);
    });

  const importSheet = (file: File) =>
    run('IMPORT', async () => {
      setSummary(null);
      const result = await importStockWorkbook({ file, branchId, entries, categories });
      setSummary(result);
      onNotice(null);
      onChanged();
    });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Tags className="size-4 text-accent" />
          <div>
            <Eyebrow>Shelf Categories</Eyebrow>
            <h2 className="mt-0.5 font-display text-base uppercase text-white">
              Grades &amp; Categories
            </h2>
          </div>
        </div>

        {categories.length === 0 ? (
          <p className="font-mono type-ui text-ash">No categories yet. Add the first one below.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <li
                key={category.id}
                className="flex items-center gap-2 border border-[color:var(--border-mono)] py-1 pl-3 pr-1 font-mono type-ui text-white"
              >
                <span>
                  {category.name}
                  <span className="ml-2 text-ash">
                    {CATEGORY_LABEL[category.product_type]} · {productCount(category.id)}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove category ${category.name}`}
                  disabled={busy !== null}
                  onClick={() => void removeCategory(category)}
                  className="flex size-8 items-center justify-center text-ash transition-colors hover:text-white disabled:opacity-40"
                >
                  {busy === category.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void addCategory();
          }}
        >
          <label className="min-w-40 flex-1 space-y-1">
            <span className="block font-mono text-xs uppercase tracking-wider text-ash">
              New category
            </span>
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. Outdoor"
              maxLength={40}
            />
          </label>
          <label className="space-y-1">
            <span className="block font-mono text-xs uppercase tracking-wider text-ash">
              Product type
            </span>
            <select
              value={newType}
              onChange={(event) => setNewType(event.target.value as ProductCategory)}
              className="h-11 border border-[color:var(--border-subtle)] bg-surface px-3 font-mono type-ui text-white"
            >
              {PRODUCT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CATEGORY_LABEL[type]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="gold" disabled={busy !== null || !newName.trim()}>
            {busy === 'ADD' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add
          </Button>
        </form>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="size-4 text-accent" />
          <div>
            <Eyebrow>Excel · {branchName}</Eyebrow>
            <h2 className="mt-0.5 font-display text-base uppercase text-white">
              Stock Spreadsheet
            </h2>
          </div>
        </div>

        <p className="font-mono type-ui text-ash">
          Export this branch&apos;s stock, edit the counts or add rows for new products, then
          import the file. Existing SKUs are updated; new SKUs are created.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy !== null} onClick={() => void exportSheet()}>
            {busy === 'EXPORT' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Export to Excel
          </Button>
          <Button variant="gold" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
            {busy === 'IMPORT' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {busy === 'IMPORT' ? 'Importing…' : 'Import from Excel'}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx"
            className="sr-only"
            aria-label="Choose a stock spreadsheet to import"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importSheet(file);
            }}
          />
        </div>

        {summary ? (
          <div role="status" className="space-y-2 border border-[color:var(--border-mono)] p-3 font-mono type-ui">
            <p className="text-white">
              Import finished: {summary.created} created, {summary.stockChanged} stock updated,{' '}
              {summary.categorised} recategorised, {summary.unchanged} unchanged
              {summary.problems.length > 0 ? `, ${summary.problems.length} not applied` : ''}.
            </p>
            {summary.problems.length > 0 ? (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-ash">
                {summary.problems.map((problem) => (
                  <li key={`${problem.row}-${problem.sku}`}>
                    Row {problem.row} ({problem.sku}): {problem.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
