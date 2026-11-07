'use client';

import React, { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import Link from 'next/link';
import {
  Sparkles,
  Send,
  ShieldCheck,
  MapPin,
  Package,
  Film,
  Bot,
  User,
  Terminal,
  Copy,
  Check,
  ArrowRight,
  Cpu,
} from 'lucide-react';
import {
  type CartelAgentUIMessage,
  executeSearchReserveCatalogue,
  executeCheckDeliveryRadius,
  executeVerifySaIdEligibility,
  executeComposeHiggsfieldPrompt,
} from '@/lib/ai/cartel-agent';
import type { ProductCategory, StrainType } from '@/types/database';

type LocalSimTurn =
  | {
      id: string;
      userText: string;
      toolName: 'searchReserveCatalogue';
      toolOutput: ReturnType<typeof executeSearchReserveCatalogue>;
      assistantSummary: string;
    }
  | {
      id: string;
      userText: string;
      toolName: 'checkDeliveryRadius';
      toolOutput: ReturnType<typeof executeCheckDeliveryRadius>;
      assistantSummary: string;
    }
  | {
      id: string;
      userText: string;
      toolName: 'verifySaIdEligibility';
      toolOutput: ReturnType<typeof executeVerifySaIdEligibility>;
      assistantSummary: string;
    }
  | {
      id: string;
      userText: string;
      toolName: 'composeHiggsfieldPrompt';
      toolOutput: ReturnType<typeof executeComposeHiggsfieldPrompt>;
      assistantSummary: string;
    };

const QUICK_PROMPTS = [
  {
    label: 'High-THC Indica in Sandton',
    prompt: 'Show high-THC Indica & Hashish drops in the Sandton Vault',
    icon: Package,
  },
  {
    label: 'Courier Fee to Rosebank',
    prompt: 'Calculate armored courier fee & ETA to Rosebank for a R 1,650 order',
    icon: MapPin,
  },
  {
    label: 'Verify SA ID 9204205123085',
    prompt: 'Run Luhn & age eligibility check on South African ID 9204205123085',
    icon: ShieldCheck,
  },
  {
    label: 'Higgsfield 9:16 Reel Prompt',
    prompt: 'Compose a Higgsfield 9:16 reel prompt for Sovereign Reserve',
    icon: Film,
  },
];

function runLocalToolFallback(promptText: string): Omit<LocalSimTurn, 'id' | 'userText'> {
  const lower = promptText.toLowerCase();

  // 1. Check SA ID verification
  const idMatch = promptText.match(/\b\d{13}\b/);
  if (idMatch || lower.includes('luhn') || lower.includes('sa id') || lower.includes('verify')) {
    const saIdNumber = idMatch ? idMatch[0] : '9204205123085';
    const output = executeVerifySaIdEligibility({ saIdNumber });
    return {
      toolName: 'verifySaIdEligibility',
      toolOutput: output,
      assistantSummary:
        output.valid && output.eligibleForMembership
          ? `SA ID \`${saIdNumber}\` passed the 13-digit Luhn mod-10 checksum and 18+ age verification (**${output.ageYears} years old**, DOB \`${output.dateOfBirth}\`, ${output.citizenship}). Ready to mint a cryptographic QR/NFC Member Pass at \`/onboarding\`.`
          : `SA ID \`${saIdNumber}\` did not pass verification (${output.valid ? 'Under 18' : output.message}). Please verify all 13 digits on your Smart ID card.`,
    };
  }

  // 2. Check Delivery / Courier
  if (
    lower.includes('courier') ||
    lower.includes('delivery') ||
    lower.includes('eta') ||
    lower.includes('rosebank') ||
    lower.includes('bryanston') ||
    lower.includes('waterfall') ||
    lower.includes('midrand')
  ) {
    const matched = lower.includes('bryanston')
      ? { suburb: 'Bryanston', lat: -26.0521, lng: 28.0214 }
      : lower.includes('waterfall') || lower.includes('midrand')
        ? { suburb: 'Waterfall / Midrand', lat: -26.0122, lng: 28.1058 }
        : lower.includes('sandton')
          ? { suburb: 'Sandton Central', lat: -26.1052, lng: 28.056 }
          : { suburb: 'Rosebank', lat: -26.1467, lng: 28.0416 };

    const randMatch = promptText.match(/r\s?(\d[\d,]*)/i);
    const orderSubtotalRand =
      randMatch && randMatch[1] ? parseInt(randMatch[1].replace(/,/g, ''), 10) : 1650;

    const output = executeCheckDeliveryRadius({
      suburb: matched.suburb,
      lat: matched.lat,
      lng: matched.lng,
      orderSubtotalRand,
    });

    return {
      toolName: 'checkDeliveryRadius',
      toolOutput: output,
      assistantSummary: output.deliverable
        ? `Armored discrete dispatch to **${output.suburb}** (${output.distanceKm} km from Sandton Vault) falls in **${output.zoneName}**. Courier fee: **${output.courierFee}** with an estimated arrival of **${output.etaMinutes} minutes** (min order ${output.minimumOrder}).`
        : (output.message ?? 'Outside delivery radius.'),
    };
  }

  // 3. Check Higgsfield Studio prompt composer
  if (
    lower.includes('higgsfield') ||
    lower.includes('reel') ||
    lower.includes('camera') ||
    lower.includes('prompt')
  ) {
    const productSkuOrName = lower.includes('elixir')
      ? 'Elixir'
      : lower.includes('rosin') || lower.includes('hash')
        ? 'Rosin'
        : 'Sovereign';
    const output = executeComposeHiggsfieldPrompt({ productSkuOrName });
    return {
      toolName: 'composeHiggsfieldPrompt',
      toolOutput: output,
      assistantSummary: `Generated a **${output.aspectRatio}** Higgsfield Studio prompt for **${output.productName}** (${output.sku ?? 'RESERVE'}). Copy this prompt directly into **06 · Inventory & Higgsfield Studio** (\`/admin/inventory\`).`,
    };
  }

  // 4. Default: Search Reserve Catalogue
  const category: ProductCategory | undefined = lower.includes('elixir')
    ? 'ELIXIR_OIL'
    : lower.includes('pre-roll') || lower.includes('preroll')
      ? 'PRE_ROLL'
      : lower.includes('edible')
        ? 'EDIBLE'
        : lower.includes('extract') || lower.includes('rosin')
          ? 'HASH_EXTRACT'
          : undefined;

  const strain: StrainType | undefined = lower.includes('indica')
    ? 'INDICA'
    : lower.includes('sativa')
      ? 'SATIVA'
      : lower.includes('hybrid')
        ? 'HYBRID'
        : undefined;

  const output = executeSearchReserveCatalogue({ category, strain });
  const lead = output.allocations[0];
  return {
    toolName: 'searchReserveCatalogue',
    toolOutput: output,
    assistantSummary:
      output.count > 0 && lead
        ? `Located **${output.count} verified reserve allocation(s)** in ${output.branch}. Top recommendation: **${lead.name}** (${lead.category} · **${lead.thcPct ?? 0}% THC** · Vault balance **${lead.vaultAvailable}**, batch \`${lead.leadBatch}\`) with terpene profile *${lead.terpenes.join(', ')}*.`
        : `No exact drops matched that filter combination—try broadening your strain or category filter to inspect all active Sandton Vault allocations.`,
  };
}

export default function CartelAgentPage() {
  const [input, setInput] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [localTurns, setLocalTurns] = useState<LocalSimTurn[]>(() => [
    {
      id: 'initial-welcome-turn',
      userText: 'Show active Reserve allocations across the Sandton Vault',
      ...runLocalToolFallback('Show active Reserve allocations'),
    } as LocalSimTurn,
  ]);
  const [usingLocalPreview, setUsingLocalPreview] = useState(false);

  const { messages, sendMessage, status, error } = useChat<CartelAgentUIMessage>({
    transport: new DefaultChatTransport({ api: '/api/agent' }),
    onError: () => {
      setUsingLocalPreview(true);
    },
  });

  const isBusy = status === 'streaming' || status === 'submitted';

  const appendLocalTurn = (trimmed: string) => {
    const result = runLocalToolFallback(trimmed);
    setLocalTurns((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        userText: trimmed,
        ...result,
      } as LocalSimTurn,
    ]);
  };

  const handleDispatchPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isBusy) return;
    setInput('');

    if (usingLocalPreview) {
      appendLocalTurn(trimmed);
      return;
    }

    try {
      const probe = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: 'probe', role: 'user', parts: [{ type: 'text', text: trimmed }] }],
        }),
      });

      if (!probe.ok) {
        setUsingLocalPreview(true);
        appendLocalTurn(trimmed);
        return;
      }
    } catch {
      setUsingLocalPreview(true);
      appendLocalTurn(trimmed);
      return;
    }

    sendMessage({ text: trimmed });
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(text);
    setTimeout(() => setCopiedPrompt(null), 2000);
  };

  return (
    <main className="min-h-screen bg-[#070A08] text-[#F4F0EA] pt-24 pb-20 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Banner */}
        <header className="rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#0F1712] via-[#090D0A] to-[#070A08] p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-mono uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Surface 09 · Vercel AI SDK ToolLoopAgent</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-[#F4F0EA]">
                420 Cartel Vault Sommelier &amp; Ops Agent
              </h1>
              <p className="text-sm text-[#A39E93] max-w-2xl">
                Powered by <code className="text-[#D4AF37]">ToolLoopAgent</code> +{' '}
                <code className="text-[#D4AF37]">Vercel AI Gateway</code> with multi-step tool calling
                for reserve cultivar curation, Sandton 25 km courier quoting, 13-digit SA ID Luhn
                verification, and Higgsfield Studio prompt engineering.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/50 border border-white/10 text-xs font-mono">
                <Cpu className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-[#A39E93]">Model:</span>
                <span className="text-[#F4F0EA]">anthropic/claude-sonnet-5.5</span>
              </div>
              <span className="text-[11px] font-mono text-emerald-400">
                ●{' '}
                {usingLocalPreview
                  ? 'Zero-Config Deterministic Tool Engine Active'
                  : 'AI SDK v7 Streaming Agent Ready'}
              </span>
            </div>
          </div>

          {/* Quick Action Chips */}
          <div className="mt-6 pt-5 border-t border-white/10">
            <p className="text-[11px] font-mono uppercase tracking-widest text-[#A39E93] mb-3">
              Dispatch Live Agent Tool Call:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {QUICK_PROMPTS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleDispatchPrompt(item.prompt)}
                    disabled={isBusy}
                    className="flex items-start gap-2.5 text-left p-3 rounded-xl bg-white/[0.03] hover:bg-[#D4AF37]/10 border border-white/10 hover:border-[#D4AF37]/40 transition-all group"
                  >
                    <Icon className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="text-xs font-medium text-[#F4F0EA] group-hover:text-[#D4AF37]">
                        {item.label}
                      </div>
                      <div className="text-[11px] text-[#A39E93] line-clamp-1 mt-0.5">
                        {item.prompt}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* Agent Conversation & Tool Call Inspector */}
        <section className="rounded-2xl border border-white/10 bg-[#0B100D]/90 backdrop-blur-xl overflow-hidden shadow-2xl">
          <div className="px-6 py-3.5 border-b border-white/10 flex items-center justify-between bg-black/40">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#A39E93]">
              <Terminal className="w-4 h-4 text-[#D4AF37]" />
              <span>Multi-Step Tool Execution Stream</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-[#A39E93]">
              <span>stopWhen: isStepCount(6)</span>
              <span>·</span>
              <span>4 Active Tools</span>
            </div>
          </div>

          <div className="p-6 space-y-6 max-h-[640px] overflow-y-auto">
            {/* Local Deterministic Tool Turns (Always works out-of-the-box) */}
            {localTurns.map((turn) => (
              <div key={turn.id} className="space-y-4">
                {/* User Message */}
                <div className="flex items-start justify-end gap-3">
                  <div className="max-w-xl rounded-2xl rounded-tr-sm bg-[#D4AF37]/15 border border-[#D4AF37]/30 px-4 py-3 text-sm text-[#F4F0EA]">
                    {turn.userText}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                </div>

                {/* Assistant + Structured Tool Output */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="flex-1 space-y-3">
                    {/* Tool Call Card */}
                    <div className="rounded-xl border border-[#D4AF37]/25 bg-black/60 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                        <span className="text-[#D4AF37] font-semibold">
                          ⚡ tool-{turn.toolName}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">
                          output-available
                        </span>
                      </div>

                      {turn.toolName === 'searchReserveCatalogue' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          {turn.toolOutput.allocations.map((strain) => (
                            <div
                              key={strain.sku}
                              className="p-3 rounded-lg bg-white/[0.03] border border-white/10 flex flex-col justify-between gap-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-sm font-medium text-[#F4F0EA]">
                                    {strain.name}
                                  </div>
                                  <div className="text-[11px] font-mono text-[#A39E93]">
                                    {strain.category} · {strain.strain ?? 'RESERVE'} ·{' '}
                                    {strain.thcPct ?? 0}% THC
                                  </div>
                                </div>
                                <span className="text-xs font-mono font-semibold text-[#D4AF37]">
                                  {strain.tiers[0]?.memberPrice ?? 'R 450'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-[#A39E93]">
                                <span>Terpenes: {strain.terpenes.join(' · ')}</span>
                                <span className="font-mono text-emerald-400">
                                  {strain.vaultAvailable}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {turn.toolName === 'checkDeliveryRadius' && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs font-mono">
                          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
                            <div className="text-[#A39E93] text-[10px]">SUBURB</div>
                            <div className="text-[#F4F0EA] mt-0.5">{turn.toolOutput.suburb}</div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
                            <div className="text-[#A39E93] text-[10px]">DISTANCE</div>
                            <div className="text-[#F4F0EA] mt-0.5">
                              {turn.toolOutput.distanceKm} km
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
                            <div className="text-[#A39E93] text-[10px]">COURIER FEE</div>
                            <div className="text-[#D4AF37] mt-0.5">
                              {turn.toolOutput.deliverable
                                ? turn.toolOutput.courierFee
                                : 'Vault Collect'}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
                            <div className="text-[#A39E93] text-[10px]">ESTIMATED ETA</div>
                            <div className="text-emerald-400 mt-0.5">
                              {turn.toolOutput.deliverable
                                ? `${turn.toolOutput.etaMinutes} min`
                                : 'Click & Collect'}
                            </div>
                          </div>
                        </div>
                      )}

                      {turn.toolName === 'verifySaIdEligibility' && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs font-mono">
                          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
                            <div className="text-[#A39E93] text-[10px]">LUHN CHECKSUM</div>
                            <div className="text-emerald-400 mt-0.5">
                              {turn.toolOutput.valid
                                ? turn.toolOutput.luhnChecksum
                                : 'INVALID'}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
                            <div className="text-[#A39E93] text-[10px]">BIRTH DATE</div>
                            <div className="text-[#F4F0EA] mt-0.5">
                              {turn.toolOutput.valid ? turn.toolOutput.dateOfBirth : 'N/A'}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
                            <div className="text-[#A39E93] text-[10px]">MEMBER AGE</div>
                            <div className="text-[#D4AF37] mt-0.5">
                              {turn.toolOutput.valid
                                ? `${turn.toolOutput.ageYears} yrs (18+)`
                                : 'N/A'}
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/10">
                            <div className="text-[#A39E93] text-[10px]">CITIZENSHIP</div>
                            <div className="text-[#F4F0EA] mt-0.5">
                              {turn.toolOutput.valid ? turn.toolOutput.citizenship : 'N/A'}
                            </div>
                          </div>
                        </div>
                      )}

                      {turn.toolName === 'composeHiggsfieldPrompt' && (
                        <div className="space-y-2 pt-1">
                          <div className="p-3 rounded-lg bg-black/70 border border-white/10 text-xs font-mono text-[#F4F0EA] leading-relaxed">
                            {turn.toolOutput.prompt}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyText(turn.toolOutput.prompt)}
                            className="inline-flex items-center gap-1.5 text-xs font-mono text-[#D4AF37] hover:underline"
                          >
                            {copiedPrompt === turn.toolOutput.prompt ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Copied Higgsfield Master Prompt</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Master Prompt for Higgsfield Studio</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Assistant Text Summary */}
                    <div className="rounded-2xl rounded-tl-sm bg-white/[0.04] border border-white/10 px-4 py-3 text-sm text-[#F4F0EA] leading-relaxed">
                      {turn.assistantSummary}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Live AI SDK v7 Streamed Messages (When AI_GATEWAY_API_KEY / OIDC is active) */}
            {messages.map((message) => (
              <div key={message.id} className="space-y-3">
                <div
                  className={`flex items-start gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role !== 'user' && (
                    <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-emerald-400" />
                    </div>
                  )}

                  <div className="max-w-2xl space-y-2.5">
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case 'text':
                          return (
                            <div
                              key={i}
                              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                                message.role === 'user'
                                  ? 'bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#F4F0EA]'
                                  : 'bg-white/[0.04] border border-white/10 text-[#F4F0EA]'
                              }`}
                            >
                              {part.text}
                            </div>
                          );
                        case 'tool-searchReserveCatalogue':
                        case 'tool-checkDeliveryRadius':
                        case 'tool-verifySaIdEligibility':
                        case 'tool-composeHiggsfieldPrompt':
                          return (
                            <div
                              key={i}
                              className="rounded-xl border border-[#D4AF37]/30 bg-black/60 p-3.5 text-xs font-mono space-y-2"
                            >
                              <div className="flex items-center justify-between text-[#D4AF37]">
                                <span>⚡ {part.type}</span>
                                <span className="text-[10px] text-emerald-400">{part.state}</span>
                              </div>
                              {part.state === 'output-available' && (
                                <pre className="text-[11px] text-[#A39E93] overflow-x-auto whitespace-pre-wrap">
                                  {JSON.stringify(part.output, null, 2)}
                                </pre>
                              )}
                            </div>
                          );
                        default:
                          return null;
                      }
                    })}
                  </div>
                </div>
              </div>
            ))}

            {error && !usingLocalPreview && (
              <div className="text-xs font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                Switched to local deterministic tool execution mode ({error.message}).
              </div>
            )}
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleDispatchPrompt(input);
            }}
            className="p-4 border-t border-white/10 bg-black/60 flex items-center gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isBusy}
              placeholder="Ask the 420 Cartel Vault Agent to filter strains, calculate courier fees, verify an SA ID, or craft a Higgsfield prompt..."
              className="flex-1 bg-white/[0.04] border border-white/15 focus:border-[#D4AF37] rounded-xl px-4 py-3 text-sm text-[#F4F0EA] placeholder:text-[#A39E93]/60 outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={isBusy || !input.trim()}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#D4AF37] hover:bg-[#e3be42] disabled:opacity-40 text-black font-medium text-sm transition-all"
            >
              <Send className="w-4 h-4" />
              <span>{isBusy ? 'Thinking...' : 'Send'}</span>
            </button>
          </form>
        </section>

        {/* Cross-Surface Links */}
        <footer className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link
            href="/shop"
            className="p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-[#D4AF37]/40 flex items-center justify-between group transition-all"
          >
            <div>
              <div className="text-xs font-mono text-[#D4AF37]">03 · PRIVATE DISPENSARY</div>
              <div className="text-sm text-[#F4F0EA] mt-0.5">Reserve Allocation Catalogue</div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#A39E93] group-hover:text-[#D4AF37] group-hover:translate-x-1 transition-all" />
          </Link>
          <Link
            href="/onboarding"
            className="p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-[#D4AF37]/40 flex items-center justify-between group transition-all"
          >
            <div>
              <div className="text-xs font-mono text-[#D4AF37]">02 · ONBOARDING &amp; PASS</div>
              <div className="text-sm text-[#F4F0EA] mt-0.5">Mint QR/NFC Member Pass</div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#A39E93] group-hover:text-[#D4AF37] group-hover:translate-x-1 transition-all" />
          </Link>
          <Link
            href="/admin/inventory"
            className="p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:border-[#D4AF37]/40 flex items-center justify-between group transition-all"
          >
            <div>
              <div className="text-xs font-mono text-[#D4AF37]">06 · HIGGSFIELD STUDIO</div>
              <div className="text-sm text-[#F4F0EA] mt-0.5">Generate 9:16 Cultivar Reels</div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#A39E93] group-hover:text-[#D4AF37] group-hover:translate-x-1 transition-all" />
          </Link>
        </footer>
      </div>
    </main>
  );
}
