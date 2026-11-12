'use client';

/**
 * 420 CARTEL :: stock spreadsheet import and export
 *
 * One sheet, one row per product, for one branch. The export is also the
 * import template: download it, edit the stock counts or add rows for new
 * products, and upload it again.
 *
 * Import rules, per row:
 *   - SKU is the key. A SKU already in the catalogue is UPDATED; a new SKU
 *     is CREATED as a product.
 *   - "Stock On Hand" is the counted quantity at the selected branch. The
 *     difference from the system quantity is posted to the stock ledger as an
 *     intake (count is higher) or a write-down (count is lower), so the ledger
 *     always explains the change. A blank cell leaves stock untouched.
 *   - "Category" assigns the shelf category; a name that does not exist yet is
 *     created.
 *
 * ExcelJS is loaded on demand so it never ships in the page's first bundle.
 */

import {
  adjustBatchStock,
  createBatch,
  createCategory,
  createProduct,
  setProductCategory,
  type CatalogueEntry,
} from '@/lib/data/source';
import { CATEGORY_LABEL, UOM_SYMBOL, roundBaseQty } from '@/lib/uom';
import type {
  BaseUom,
  CatalogueCategoryRow,
  ProductCategory,
  StrainType,
} from '@/types/database';

const COLUMNS = [
  { header: 'SKU', key: 'sku', width: 18 },
  { header: 'Product', key: 'name', width: 34 },
  { header: 'Type', key: 'type', width: 18 },
  { header: 'Category', key: 'category', width: 18 },
  { header: 'Unit', key: 'unit', width: 10 },
  { header: 'Strain', key: 'strain', width: 16 },
  { header: 'THC %', key: 'thc', width: 10 },
  { header: 'Tier', key: 'tier', width: 12 },
  { header: 'Tier Qty', key: 'tierQty', width: 10 },
  { header: 'Tier Price (R)', key: 'tierPrice', width: 15 },
  { header: 'Stock On Hand', key: 'stock', width: 15 },
  { header: 'Cost per Unit (R)', key: 'cost', width: 17 },
  { header: 'Low Stock At', key: 'lowStock', width: 13 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

const UNIT_BY_TEXT: Record<string, BaseUom> = {
  g: 'GRAMS',
  gram: 'GRAMS',
  grams: 'GRAMS',
  ml: 'MILLILITERS',
  milliliters: 'MILLILITERS',
  millilitres: 'MILLILITERS',
  ea: 'UNITS',
  unit: 'UNITS',
  units: 'UNITS',
};

const DEFAULT_UNIT: Record<ProductCategory, BaseUom> = {
  FLOWER: 'GRAMS',
  HASH_EXTRACT: 'GRAMS',
  ELIXIR_OIL: 'MILLILITERS',
  DISTILLATE: 'MILLILITERS',
  PRE_ROLL: 'UNITS',
  EDIBLE: 'UNITS',
  VAPE: 'UNITS',
  MERCH: 'UNITS',
  ACCESSORY: 'UNITS',
};

const STRAINS: StrainType[] = ['INDICA', 'SATIVA', 'HYBRID', 'CBD', 'NOT_APPLICABLE'];

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportStockWorkbook(input: {
  entries: CatalogueEntry[];
  categories: CatalogueCategoryRow[];
  branchName: string;
}): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '420 Cartel';
  const sheet = workbook.addWorksheet('Stock', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS.map((column) => ({ ...column }));
  sheet.getRow(1).font = { bold: true };

  const categoryName = new Map(input.categories.map((c) => [c.id, c.name]));

  for (const { product, variants, batches, stock } of input.entries) {
    const tier = variants.find((v) => !v.is_custom_amount) ?? variants[0];
    const newestBatch = batches[batches.length - 1];
    sheet.addRow({
      sku: product.sku,
      name: product.name,
      type: CATEGORY_LABEL[product.category],
      category: product.category_id ? (categoryName.get(product.category_id) ?? '') : '',
      unit: UOM_SYMBOL[product.base_uom],
      strain: product.strain,
      thc: product.thc_pct ?? '',
      tier: tier?.label ?? '',
      tierQty: tier?.base_quantity ?? '',
      tierPrice: tier ? tier.price_cents / 100 : '',
      stock: stock.remaining_base_qty,
      cost: newestBatch ? newestBatch.cost_per_base_unit_cents / 100 : '',
      lowStock: stock.low_stock_threshold,
    } satisfies Record<ColumnKey, string | number>);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `420-cartel-stock-${normalise(input.branchName) || 'branch'}-${fileStamp()}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface StockImportSummary {
  created: number;
  stockChanged: number;
  categorised: number;
  unchanged: number;
  /** Rows that could not be applied, with the spreadsheet row number. */
  problems: { row: number; sku: string; reason: string }[];
}

type SheetRow = Partial<Record<ColumnKey, string>> & { rowNumber: number };

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const cell = value as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (cell.result !== undefined) return cellText(cell.result);
    if (typeof cell.text === 'string') return cell.text;
    if (Array.isArray(cell.richText)) return cell.richText.map((part) => part.text).join('');
    return '';
  }
  return String(value).trim();
}

function parseNumber(text: string | undefined): number | null {
  if (text === undefined) return null;
  const cleaned = text.replace(/[R\s,]/gi, '');
  if (cleaned === '') return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

async function readRows(file: File): Promise<SheetRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('That workbook has no sheets.');

  const keyByHeader = new Map(COLUMNS.map((c) => [normalise(c.header), c.key]));
  const keyByColumn = new Map<number, ColumnKey>();
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    const key = keyByHeader.get(normalise(cellText(cell.value)));
    if (key) keyByColumn.set(columnNumber, key);
  });
  if (![...keyByColumn.values()].includes('sku')) {
    throw new Error('The first row must contain a "SKU" column. Export a sheet to get the template.');
  }

  const rows: SheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const parsed: SheetRow = { rowNumber };
    for (const [columnNumber, key] of keyByColumn) {
      parsed[key] = cellText(row.getCell(columnNumber).value);
    }
    if (Object.entries(parsed).some(([key, value]) => key !== 'rowNumber' && value !== '')) {
      rows.push(parsed);
    }
  });
  return rows;
}

function parseType(text: string | undefined): ProductCategory | null {
  if (!text) return null;
  const wanted = normalise(text);
  for (const [key, label] of Object.entries(CATEGORY_LABEL) as [ProductCategory, string][]) {
    if (normalise(key) === wanted || normalise(label) === wanted) return key;
  }
  return null;
}

export async function importStockWorkbook(input: {
  file: File;
  branchId: string;
  entries: CatalogueEntry[];
  categories: CatalogueCategoryRow[];
}): Promise<StockImportSummary> {
  const rows = await readRows(input.file);
  const summary: StockImportSummary = {
    created: 0,
    stockChanged: 0,
    categorised: 0,
    unchanged: 0,
    problems: [],
  };

  const entryBySku = new Map(input.entries.map((e) => [e.product.sku.toUpperCase(), e]));
  const categoryByName = new Map(input.categories.map((c) => [c.name.toLowerCase(), c]));
  const stamp = `Spreadsheet import ${fileStamp()}`;

  for (const row of rows) {
    const sku = (row.sku ?? '').toUpperCase();
    try {
      if (!sku) throw new Error('Missing SKU.');

      const existing = entryBySku.get(sku);
      const type = parseType(row.type) ?? existing?.product.category ?? 'FLOWER';

      // Resolve the shelf category, creating it the first time it is named.
      let categoryId: string | null | undefined;
      if (row.category !== undefined) {
        const name = row.category.trim();
        if (name === '') {
          categoryId = null;
        } else {
          let category = categoryByName.get(name.toLowerCase());
          if (!category) {
            category = await createCategory(name, type);
            categoryByName.set(name.toLowerCase(), category);
          }
          categoryId = category.id;
        }
      }

      const counted = parseNumber(row.stock);
      if (counted !== null && counted < 0) throw new Error('Stock On Hand cannot be negative.');
      const cost = parseNumber(row.cost);

      if (!existing) {
        const name = (row.name ?? '').trim();
        if (!name) throw new Error('New product needs a Product name.');
        const price = parseNumber(row.tierPrice);
        if (price === null || price < 0) throw new Error('New product needs a Tier Price (R).');
        const unit = UNIT_BY_TEXT[normalise(row.unit ?? '')] ?? DEFAULT_UNIT[type];
        const tierQty = parseNumber(row.tierQty) ?? 1;
        if (tierQty <= 0) throw new Error('Tier Qty must be greater than zero.');
        const strainText = normalise(row.strain ?? '').toUpperCase();
        const strain =
          STRAINS.find((s) => normalise(s).toUpperCase() === strainText) ??
          (type === 'FLOWER' ? 'HYBRID' : 'NOT_APPLICABLE');

        await createProduct({
          sku,
          name,
          category: type,
          baseUom: unit,
          strain,
          thcPct: parseNumber(row.thc),
          cbdPct: null,
          variantLabel: (row.tier ?? '').trim() || `${tierQty}${UOM_SYMBOL[unit]}`,
          variantBaseQty: tierQty,
          variantPriceCents: Math.round(price * 100),
          categoryId: categoryId ?? null,
          initialAllocation:
            counted !== null && counted > 0
              ? {
                  branchId: input.branchId,
                  quantity: counted,
                  costPerBaseUnitCents: Math.round((cost ?? 0) * 100),
                  lowStockThreshold: parseNumber(row.lowStock) ?? 10,
                }
              : null,
        });
        summary.created += 1;
        continue;
      }

      let changed = false;
      const { product, batches, stock } = existing;

      if (categoryId !== undefined && (product.category_id ?? null) !== categoryId) {
        await setProductCategory(product.id, categoryId);
        summary.categorised += 1;
        changed = true;
      }

      if (counted !== null) {
        const uom = product.base_uom;
        const diff = roundBaseQty(counted - stock.remaining_base_qty, uom);
        const open = batches.filter((batch) => batch.is_active);

        if (diff > 0) {
          const target = open[open.length - 1];
          if (target) {
            await adjustBatchStock({
              batchId: target.id,
              movementType: 'INTAKE',
              baseQty: diff,
              reason: `${stamp}: count above system quantity`,
            });
          } else {
            await createBatch({
              productId: product.id,
              branchId: input.branchId,
              batchCode: `${sku}-${Date.now().toString(36).slice(-5)}`.toUpperCase(),
              receivedBaseQty: diff,
              costPerBaseUnitCents: Math.round((cost ?? 0) * 100),
              lowStockThreshold: parseNumber(row.lowStock) ?? 10,
              thcPct: product.thc_pct,
              cbdPct: product.cbd_pct,
              terpeneProfile: {},
              harvestDate: null,
              expiryDate: null,
            });
          }
          summary.stockChanged += 1;
          changed = true;
        } else if (diff < 0) {
          // Write the shortfall down oldest batch first, never below what
          // member carts are holding.
          let outstanding = -diff;
          for (const batch of open) {
            if (outstanding <= 0) break;
            const free = roundBaseQty(batch.remaining_base_qty - batch.reserved_base_qty, uom);
            const take = Math.min(outstanding, free);
            if (take <= 0) continue;
            await adjustBatchStock({
              batchId: batch.id,
              movementType: 'WASTE',
              baseQty: take,
              reason: `${stamp}: count below system quantity`,
            });
            outstanding = roundBaseQty(outstanding - take, uom);
          }
          if (outstanding > 0) {
            throw new Error(
              `Could not write down ${outstanding}${UOM_SYMBOL[uom]}: that stock is held in member carts.`,
            );
          }
          summary.stockChanged += 1;
          changed = true;
        }
      }

      if (!changed) summary.unchanged += 1;
    } catch (caught) {
      summary.problems.push({
        row: row.rowNumber,
        sku: sku || '(blank)',
        reason: caught instanceof Error ? caught.message : 'Could not apply this row.',
      });
    }
  }

  return summary;
}
