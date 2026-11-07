'use client';

import * as React from 'react';
import { QrCode } from '@/components/ui/QrCode';
import { formatCentsBare } from '@/lib/money';
import { exVatCents, vatPortionCents, VAT_RATE_BPS } from '@/lib/pricing';
import { UOM_SYMBOL } from '@/lib/uom';
import type {
  BaseUom,
  BatchAllocationEntry,
  PaymentMethod,
  ProcessOrderResult,
} from '@/types/database';

/**
 * 420 CARTEL :: 80mm ESC/POS thermal receipt (Module 5)
 *
 * Printed by `window.print()` straight from the POS. The print rules live in
 * `globals.css` under `@media print`, and they are scoped to `#thermal-receipt`:
 * everything else on the page is set to `visibility: hidden`, so this component
 * MUST render that id or the printer produces a blank slip. That is why the id
 * is hard-coded here rather than passed in.
 *
 * Geometry: 80mm paper, 72mm printable width, monospace throughout. Every
 * figure is right-aligned on a fixed column so the slip reads cleanly off a
 * 203dpi head, and nothing relies on colour, background or box-shadow — a
 * thermal head prints one ink.
 *
 * On screen it renders as a preview of the same markup, so what the budtender
 * checks is exactly what the printer receives.
 */

export interface ThermalReceiptTender {
  method: PaymentMethod;
  amountCents: number;
  tenderedCents?: number | null;
  changeCents?: number | null;
  reference?: string | null;
}

export interface ThermalReceiptProps {
  receipt: ProcessOrderResult;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  terminalLabel?: string;
  cashierName?: string | null;
  member?: {
    memberCode: string;
    fullName: string;
    rankLabel: string;
    pointsBalance?: number | null;
    creditBalanceCents?: number | null;
  } | null;
  tender?: readonly ThermalReceiptTender[];
  /** VAT registration number, printed where SARS expects it. */
  vatNumber?: string | null;
  issuedAt?: Date;
  /** Preview chrome on screen; never printed. */
  className?: string;
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'CASH',
  CARD_TERMINAL: 'CARD',
  EFT_INSTANT: 'INSTANT EFT',
  MANUAL_EFT: 'EFT TRANSFER',
  MEMBER_CREDIT: 'MEMBER CREDIT',
  PAY_ON_COLLECTION: 'DUE ON COLLECTION',
  FUTURE_GATEWAY: 'ONLINE PAYMENT',
};

/** Deduction line: "3.500 g off #GF-01". Three decimals is scale precision. */
function allocationLine(allocation: BatchAllocationEntry[], uom: BaseUom): string[] {
  return allocation.map(
    (entry) =>
      `${entry.base_qty.toFixed(3)} ${UOM_SYMBOL[uom]} off #${entry.batch_code}`,
  );
}

function Row({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '2mm',
        fontWeight: bold ? 700 : 400,
      }}
    >
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

function Rule() {
  return <div className="receipt-rule" />;
}

export function ThermalReceiptPrint({
  receipt,
  branchName,
  branchAddress,
  branchPhone,
  terminalLabel = 'TILL 1',
  cashierName,
  member,
  tender = [],
  vatNumber,
  issuedAt = new Date(),
  className,
}: ThermalReceiptProps) {
  const stamp = new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Africa/Johannesburg',
  }).format(issuedAt);

  const vat = vatPortionCents(receipt.total_cents);
  const exVat = exVatCents(receipt.total_cents);

  const cashChange = tender.reduce(
    (total, line) => total + Math.max(0, line.changeCents ?? 0),
    0,
  );

  // Base-unit totals, so the slip states what left the vault in each unit.
  const uomTotals = receipt.items.reduce<Record<BaseUom, number>>(
    (totals, item) => {
      totals[item.base_uom] += item.base_qty;
      return totals;
    },
    { GRAMS: 0, MILLILITERS: 0, UNITS: 0 },
  );

  return (
    <div
      id="thermal-receipt"
      className={className}
      style={{
        width: '72mm',
        background: '#ffffff',
        color: '#000000',
        fontFamily: "ui-monospace, 'Courier New', monospace",
        fontSize: '10.5pt',
        lineHeight: 1.3,
        padding: '2mm',
      }}
    >
      {/* ---- Crest -------------------------------------------------- */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '16pt', fontWeight: 900, letterSpacing: '0.12em' }}>
          420 CARTEL
        </div>
        <div style={{ fontSize: '7.5pt', letterSpacing: '0.3em' }}>
          PRIVATE BOTANICAL COLLECTIVE
        </div>
        <div style={{ marginTop: '1mm', fontSize: '8pt' }}>{branchName}</div>
        {branchAddress ? <div style={{ fontSize: '8pt' }}>{branchAddress}</div> : null}
        {branchPhone ? <div style={{ fontSize: '8pt' }}>{branchPhone}</div> : null}
        {vatNumber ? <div style={{ fontSize: '8pt' }}>VAT NO {vatNumber}</div> : null}
      </div>

      <Rule />

      {/* ---- Docket header ------------------------------------------ */}
      <Row label="DOCKET" value={`#${receipt.order_number}`} bold />
      <Row label="DATE" value={stamp} />
      <Row label="TILL" value={terminalLabel} />
      {cashierName ? <Row label="SERVED BY" value={cashierName} /> : null}
      <Row
        label="CHANNEL"
        value={`${receipt.channel} / ${receipt.fulfilment_type}`}
      />

      {/* ---- Member ------------------------------------------------- */}
      {member ? (
        <>
          <Rule />
          <Row label="MEMBER" value={member.memberCode} bold />
          <Row label="NAME" value={member.fullName} />
          <Row label="RANK" value={member.rankLabel} />
          <div style={{ fontSize: '8pt', textAlign: 'center', marginTop: '0.5mm' }}>
            18+ VERIFIED MEMBER
          </div>
        </>
      ) : (
        <>
          <Rule />
          <div style={{ fontSize: '8pt', textAlign: 'center' }}>
            WALK-IN · 18+ ID CHECKED AT COUNTER
          </div>
        </>
      )}

      <Rule />

      {/* ---- Lines -------------------------------------------------- */}
      {receipt.items.map((item, index) => {
        const unitBaseQty = item.quantity > 0 ? item.base_qty / item.quantity : item.base_qty;

        return (
          <div key={`${item.product_name}-${index}`} style={{ marginBottom: '1.5mm' }}>
            <div style={{ fontWeight: 700 }}>{item.product_name.toUpperCase()}</div>
            <Row
              label={`${item.quantity} x ${item.variant_label}`}
              value={formatCentsBare(item.line_total_cents)}
            />
            <div style={{ fontSize: '8pt', paddingLeft: '2mm' }}>
              {/* The exact deduction in the product's own base unit. */}
              <div>
                {unitBaseQty.toFixed(3)} {UOM_SYMBOL[item.base_uom]} each ·{' '}
                {item.base_qty.toFixed(3)} {UOM_SYMBOL[item.base_uom]} total
              </div>
              {allocationLine(item.batch_allocation, item.base_uom).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>
        );
      })}

      <Rule />

      {/* ---- Unit roll-up ------------------------------------------- */}
      {uomTotals.GRAMS > 0 ? (
        <Row label="TOTAL WEIGHT" value={`${uomTotals.GRAMS.toFixed(3)} g`} />
      ) : null}
      {uomTotals.MILLILITERS > 0 ? (
        <Row label="TOTAL VOLUME" value={`${uomTotals.MILLILITERS.toFixed(1)} ml`} />
      ) : null}
      {uomTotals.UNITS > 0 ? (
        <Row label="TOTAL UNITS" value={`${uomTotals.UNITS.toFixed(0)} ea`} />
      ) : null}

      <Rule />

      {/* ---- Money -------------------------------------------------- */}
      <Row label="SUBTOTAL" value={formatCentsBare(receipt.subtotal_cents)} />
      {receipt.discount_cents > 0 ? (
        <Row label="DISCOUNT" value={`-${formatCentsBare(receipt.discount_cents)}`} />
      ) : null}
      {receipt.delivery_fee_cents > 0 ? (
        <Row label="DELIVERY" value={formatCentsBare(receipt.delivery_fee_cents)} />
      ) : null}
      <Row label={`EXCL VAT`} value={formatCentsBare(exVat)} />
      <Row label={`VAT @ ${(VAT_RATE_BPS / 100).toFixed(0)}%`} value={formatCentsBare(vat)} />
      <div style={{ fontSize: '13pt', fontWeight: 900, marginTop: '1mm' }}>
        <Row label="TOTAL ZAR" value={formatCentsBare(receipt.total_cents)} bold />
      </div>

      {/* ---- Tender ------------------------------------------------- */}
      {tender.length > 0 ? (
        <>
          <Rule />
          {tender.map((line, index) => (
            <React.Fragment key={`${line.method}-${index}`}>
              <Row
                label={METHOD_LABEL[line.method]}
                value={formatCentsBare(
                  line.method === 'CASH' && line.tenderedCents
                    ? line.tenderedCents
                    : line.amountCents,
                )}
              />
              {line.reference ? (
                <div style={{ fontSize: '8pt', paddingLeft: '2mm' }}>REF {line.reference}</div>
              ) : null}
            </React.Fragment>
          ))}
          {cashChange > 0 ? <Row label="CHANGE DUE" value={formatCentsBare(cashChange)} bold /> : null}
        </>
      ) : null}

      {receipt.outstanding_cents > 0 ? (
        <Row label="BALANCE DUE" value={formatCentsBare(receipt.outstanding_cents)} bold />
      ) : null}

      {/* ---- Loyalty ------------------------------------------------ */}
      {member ? (
        <>
          <Rule />
          <Row label="POINTS EARNED" value={`+${receipt.points_earned}`} />
          {receipt.points_redeemed > 0 ? (
            <Row label="POINTS REDEEMED" value={`-${receipt.points_redeemed}`} />
          ) : null}
          {typeof member.pointsBalance === 'number' ? (
            <Row label="POINTS BALANCE" value={String(member.pointsBalance)} />
          ) : null}
          {typeof member.creditBalanceCents === 'number' ? (
            <Row label="STORE CREDIT" value={formatCentsBare(member.creditBalanceCents)} />
          ) : null}
        </>
      ) : null}

      <Rule />

      {/* ---- Verification QR ---------------------------------------- */}
      <div style={{ textAlign: 'center', marginTop: '1mm' }}>
        {/* Pure black on white: the only pair a thermal head reproduces. */}
        <QrCode value={receipt.order_number} size={112} margin={2} dark="#000000" light="#FFFFFF" />
        <div style={{ fontSize: '7.5pt', marginTop: '1mm' }}>
          SCAN TO VERIFY · {receipt.order_number}
        </div>
      </div>

      <Rule />

      <div style={{ textAlign: 'center', fontSize: '7.5pt', lineHeight: 1.4 }}>
        <div>STRICTLY 18+. NOT FOR RESALE.</div>
        <div>Cultivated and allocated under the</div>
        <div>private collective agreement.</div>
        <div style={{ marginTop: '1mm', letterSpacing: '0.2em' }}>OBSIDIAN CRAFT · PURE GOLD</div>
      </div>
    </div>
  );
}

/**
 * Trigger the print dialog once the receipt has painted.
 *
 * Two frames, not `setTimeout`: the first lets React commit the receipt, the
 * second lets the browser lay it out before the print snapshot is taken.
 * Printing too early is what produces a half-rendered slip.
 */
export function printThermalReceipt(): void {
  if (typeof window === 'undefined') return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.print());
  });
}

export default ThermalReceiptPrint;
