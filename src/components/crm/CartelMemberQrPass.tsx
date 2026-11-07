'use client';

import { useCallback, useMemo, useState } from 'react';
import { Check, Copy, Download, ShieldCheck, ShieldX } from 'lucide-react';
import { QrCode } from '@/components/ui/QrCode';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/surfaces';
import { formatCents } from '@/lib/money';
import { RANK_LABEL } from '@/lib/loyalty';
import { LEGAL_AGE, ageInYears } from '@/lib/sa-id';
import { cn } from '@/lib/utils';
import type { MemberRow } from '@/types/database';

/**
 * 420 Cartel digital member pass.
 *
 * An obsidian-and-24K-gold private club card. The QR encodes the member code,
 * which is what `lookup_member_for_pos` resolves at the till, so the same
 * card works on a phone screen, printed, or exported as SVG.
 */

export interface CartelMemberQrPassProps {
  member: MemberRow;
  /** Absolute site origin, used to build the shareable referral link. */
  siteUrl?: string;
  className?: string;
  /** Hides the download / copy action bar — used inside the admin drawer. */
  compact?: boolean;
}

function buildReferralLink(siteUrl: string, code: string): string {
  try {
    const url = new URL(siteUrl);
    url.searchParams.set('ref', code);
    return url.toString();
  } catch {
    return `${siteUrl.replace(/\/$/, '')}/?ref=${code}`;
  }
}

/**
 * A self-contained SVG of the pass, so a member can save it to their phone
 * without the app. Everything is inlined — no external fonts or images.
 */
function buildPassSvg(member: MemberRow, qrPath: string, qrSpan: number): string {
  const name = `${member.first_name} ${member.last_name}`.toUpperCase();
  const rank = RANK_LABEL[member.rank].toUpperCase();
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="1000" viewBox="0 0 640 1000">
  <defs>
    <linearGradient id="foil" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#AA771C"/>
      <stop offset="38%" stop-color="#D4AF37"/>
      <stop offset="50%" stop-color="#F3E5AB"/>
      <stop offset="62%" stop-color="#D4AF37"/>
      <stop offset="100%" stop-color="#AA771C"/>
    </linearGradient>
  </defs>
  <rect width="640" height="1000" fill="#050505"/>
  <rect x="12" y="12" width="616" height="976" fill="none" stroke="#D4AF37" stroke-width="2"/>
  <rect x="12" y="12" width="616" height="86" fill="url(#foil)"/>
  <text x="40" y="66" font-family="monospace" font-size="27" font-weight="bold" letter-spacing="7" fill="#050505">420 CARTEL</text>
  <text x="40" y="150" font-family="monospace" font-size="13" letter-spacing="5" fill="#8E8E93">PRIVATE BOTANICAL COLLECTIVE</text>
  <text x="40" y="206" font-family="monospace" font-size="30" font-weight="bold" letter-spacing="2" fill="#FFFFFF">${escape(name)}</text>
  <text x="40" y="252" font-family="monospace" font-size="24" letter-spacing="5" fill="#D4AF37">${escape(member.member_code)}</text>
  <rect x="40" y="290" width="560" height="1" fill="#2A2A2A"/>
  <text x="40" y="336" font-family="monospace" font-size="12" letter-spacing="4" fill="#8E8E93">RANK</text>
  <text x="40" y="366" font-family="monospace" font-size="20" fill="#F3E5AB">${escape(rank)}</text>
  <text x="330" y="336" font-family="monospace" font-size="12" letter-spacing="4" fill="#8E8E93">STATUS</text>
  <text x="330" y="366" font-family="monospace" font-size="20" fill="#F3E5AB">${escape(member.status.replace(/_/g, ' '))}</text>
  <text x="40" y="424" font-family="monospace" font-size="12" letter-spacing="4" fill="#8E8E93">AGE VERIFICATION</text>
  <text x="40" y="454" font-family="monospace" font-size="20" fill="${member.age_verified_at ? '#6EE7B7' : '#F87171'}">${member.age_verified_at ? `${LEGAL_AGE}+ VERIFIED` : 'NOT VERIFIED'}</text>
  <rect x="150" y="510" width="340" height="340" fill="#FFFFFF"/>
  <g transform="translate(150 510) scale(${340 / qrSpan})"><path d="${qrPath}" fill="#050505"/></g>
  <text x="320" y="906" text-anchor="middle" font-family="monospace" font-size="13" letter-spacing="4" fill="#8E8E93">PRESENT THIS PASS AT THE VAULT</text>
  <text x="320" y="948" text-anchor="middle" font-family="monospace" font-size="11" letter-spacing="3" fill="#4A4A4F">ADULTS ${LEGAL_AGE}+ ONLY · NOT TRANSFERABLE</text>
</svg>`;
}

export function CartelMemberQrPass({
  member,
  siteUrl,
  className,
  compact = false,
}: CartelMemberQrPassProps) {
  const [copied, setCopied] = useState(false);

  const origin =
    siteUrl ??
    (typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://420cartel.co.za'));

  const referralLink = buildReferralLink(origin, member.referral_code);
  const verified = member.age_verified_at !== null;

  const age = useMemo(() => {
    const dob = new Date(`${member.date_of_birth}T00:00:00Z`);
    return Number.isNaN(dob.getTime()) ? null : ageInYears(dob);
  }, [member.date_of_birth]);

  const copyReferral = useCallback(() => {
    void navigator.clipboard
      .writeText(referralLink)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  }, [referralLink]);

  const downloadPass = useCallback(() => {
    // Rebuild the matrix here so the exported file is independent of the DOM.
    void import('qrcode').then(({ default: QRCodeLib }) => {
      const qr = QRCodeLib.create(member.member_code, { errorCorrectionLevel: 'M' });
      const count = qr.modules.size;
      const data = qr.modules.data;
      const margin = 2;
      let path = '';
      for (let row = 0; row < count; row += 1) {
        for (let column = 0; column < count; column += 1) {
          if (data[row * count + column]) {
            path += `M${column + margin} ${row + margin}h1v1h-1z`;
          }
        }
      }

      const svg = buildPassSvg(member, path, count + margin * 2);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `420-cartel-pass-${member.member_code}.svg`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }, [member]);

  return (
    <div className={cn('w-full max-w-sm', className)}>
      <div className="border-2 border-[#D4AF37] bg-void shadow-obsidian">
        {/* Gold foil header */}
        <div className="bg-gold-sheen px-5 py-3.5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-sm font-bold uppercase tracking-[0.42em] text-void">
              420 Cartel
            </span>
            <span className="font-mono text-[0.5rem] uppercase tracking-[0.3em] text-void/70">
              Member Pass
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <div>
            <p className="font-mono text-[0.5rem] uppercase tracking-[0.34em] text-faint">
              Private Botanical Collective
            </p>
            <p className="mt-2.5 font-display text-2xl font-black uppercase leading-none tracking-tight text-white">
              {member.first_name} {member.last_name}
            </p>
            <p className="mt-1.5 font-mono text-lg tracking-[0.2em] text-gold">
              {member.member_code}
            </p>
          </div>

          <div className="h-px w-full bg-[color:var(--border-mono)]" />

          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <PassStat label="Rank" value={RANK_LABEL[member.rank]} />
            <PassStat label="Standing" value={member.status.replace(/_/g, ' ')} />
            <PassStat label="Store Credit" value={formatCents(member.credit_balance_cents)} />
            <PassStat label="Points" value={member.points_balance.toLocaleString('en-ZA')} />
          </div>

          <div>
            {verified ? (
              <Badge tone="live" className="w-full justify-center py-1.5">
                <ShieldCheck className="size-3" />
                {LEGAL_AGE}+ Age Verified{age !== null ? ` · ${age} yrs` : ''}
              </Badge>
            ) : (
              <Badge tone="warn" className="w-full justify-center py-1.5">
                <ShieldX className="size-3" />
                Age Verification Pending
              </Badge>
            )}
          </div>

          {/* QR — encodes the member code the till scanner resolves. */}
          <div className="flex flex-col items-center gap-3 bg-white p-4">
            <QrCode value={member.member_code} size={168} title={`Pass for ${member.member_code}`} />
            <span className="font-mono text-[0.5625rem] uppercase tracking-[0.26em] text-[#050505]">
              {member.member_code}
            </span>
          </div>

          <p className="text-center font-mono text-[0.5rem] uppercase leading-relaxed tracking-[0.22em] text-faint">
            Present at the vault · Not transferable · Adults {LEGAL_AGE}+ only
          </p>
        </div>

        {!compact ? (
          <div className="grid grid-cols-2 border-t border-[color:var(--border-mono)]">
            <Button
              variant="ghost"
              size="sm"
              onClick={downloadPass}
              className="h-12 rounded-none border-r border-[color:var(--border-mono)] hover:text-gold"
            >
              <Download className="size-3.5" />
              Download
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={copyReferral}
              className="h-12 rounded-none hover:text-gold"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Referral Link'}
            </Button>
          </div>
        ) : null}
      </div>

      {!compact ? (
        <p className="mt-3 break-all font-mono text-[0.5625rem] leading-relaxed text-faint">
          {referralLink}
        </p>
      ) : null}
    </div>
  );
}

function PassStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[0.5rem] uppercase tracking-[0.3em] text-faint">
        {label}
      </span>
      <span className="font-mono text-sm uppercase tabular-nums text-white">{value}</span>
    </div>
  );
}

export default CartelMemberQrPass;
