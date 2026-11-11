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
    <main className="min-h-screen bg-void text-foreground pt-24 pb-20 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Banner */}
        <header className="border border-ash p-6 sm:p-8 ">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-transparent border border-ash text-foreground type-ui font-mono ">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Surface 09 · Vercel AI SDK ToolLoopAgent</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-display uppercase text-foreground">
                420 Cartel Vault Sommelier &amp; Ops Agent
              </h1>
              <p className="type-ui text-foreground max-w-2xl">
                Powered by <code className="text-foreground">ToolLoopAgent</code> +{' '}
                <code className="text-foreground">Vercel AI Gateway</code> with multi-step tool calling
                for reserve cultivar curation, Sandton 25 km courier quoting, 13-digit SA ID Luhn
                verification, and Higgsfield Studio prompt engineering.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-void border border-ash type-ui font-mono">
                <Cpu className="w-4 h-4 text-foreground" />
                <span className="text-foreground">Model:</span>
                <span className="text-foreground">anthropic/claude-sonnet-5.5</span>
              </div>
              <span className="type-ui font-mono text-foreground">
                ●{' '}
                {usingLocalPreview
                  ? 'Zero-Config Deterministic Tool Engine Active'
                  : 'AI SDK v7 Streaming Agent Ready'}
              </span>
            </div>
          </div>

          {/* Quick Action Chips */}
          <div className="mt-6 pt-5 border-t border-ash">
            <p className="type-ui font-mono text-foreground mb-3">
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
                    className="flex items-start gap-2.5 text-left p-3 bg-transparent hover:bg-transparent border border-ash hover:border-ash transition-all group"
                  >
                    <Icon className="w-4 h-4 text-foreground shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="type-ui font-medium text-foreground group-hover:text-foreground">
                        {item.label}
                      </div>
                      <div className="type-ui text-foreground line-clamp-1 mt-0.5">
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
        <section className="border border-ash bg-void overflow-hidden ">
          <div className="px-4 sm:px-6 py-3.5 border-b border-ash flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-void">
            <div className="flex items-center gap-2 type-ui font-mono text-foreground">
              <Terminal className="w-4 h-4 text-foreground" />
              <span>Multi-Step Tool Execution Stream</span>
            </div>
            <div className="flex items-center gap-3 type-ui font-mono text-foreground">
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
                  <div className="max-w-xl  bg-transparent border border-ash px-4 py-3 type-ui text-foreground">
                    {turn.userText}
                  </div>
                  <div className="w-8 h-8 bg-transparent border border-ash flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-foreground" />
                  </div>
                </div>

                {/* Assistant + Structured Tool Output */}
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-transparent border border-foreground flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-foreground" />
                  </div>
                  <div className="flex-1 space-y-3">
                    {/* Tool Call Card */}
                    <div className="border border-ash bg-void p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 type-ui font-mono">
                        <span className="text-foreground font-semibold">
                          ⚡ tool-{turn.toolName}
                        </span>
                        <span className="px-2 py-0.5 bg-transparent text-foreground border border-foreground type-ui">
                          output-available
                        </span>
                      </div>

                      {turn.toolName === 'searchReserveCatalogue' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          {turn.toolOutput.allocations.map((strain) => (
                            <div
                              key={strain.sku}
                              className="p-3 bg-transparent border border-ash flex flex-col justify-between gap-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="type-ui font-medium text-foreground">
                                    {strain.name}
                                  </div>
                                  <div className="type-ui font-mono text-foreground">
                                    {strain.category} · {strain.strain ?? 'RESERVE'} ·{' '}
                                    {strain.thcPct ?? 0}% THC
                                  </div>
                                </div>
                                <span className="type-ui font-mono font-semibold text-foreground">
                                  {strain.tiers[0]?.memberPrice ?? 'R 450'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between type-ui text-foreground">
                                <span>Terpenes: {strain.terpenes.join(' · ')}</span>
                                <span className="font-mono text-foreground">
                                  {strain.vaultAvailable}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {turn.toolName === 'checkDeliveryRadius' && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 type-ui font-mono">
                          <div className="p-2.5 bg-transparent border border-ash">
                            <div className="text-foreground type-ui">SUBURB</div>
                            <div className="text-foreground mt-0.5">{turn.toolOutput.suburb}</div>
                          </div>
                          <div className="p-2.5 bg-transparent border border-ash">
                            <div className="text-foreground type-ui">DISTANCE</div>
                            <div className="text-foreground mt-0.5">
                              {turn.toolOutput.distanceKm} km
                            </div>
                          </div>
                          <div className="p-2.5 bg-transparent border border-ash">
                            <div className="text-foreground type-ui">COURIER FEE</div>
                            <div className="text-foreground mt-0.5">
                              {turn.toolOutput.deliverable
                                ? turn.toolOutput.courierFee
                                : 'Vault Collect'}
                            </div>
                          </div>
                          <div className="p-2.5 bg-transparent border border-ash">
                            <div className="text-foreground type-ui">ESTIMATED ETA</div>
                            <div className="text-foreground mt-0.5">
                              {turn.toolOutput.deliverable
                                ? `${turn.toolOutput.etaMinutes} min`
                                : 'Click & Collect'}
                            </div>
                          </div>
                        </div>
                      )}

                      {turn.toolName === 'verifySaIdEligibility' && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 type-ui font-mono">
                          <div className="p-2.5 bg-transparent border border-ash">
                            <div className="text-foreground type-ui">LUHN CHECKSUM</div>
                            <div className="text-foreground mt-0.5">
                              {turn.toolOutput.valid
                                ? turn.toolOutput.luhnChecksum
                                : 'INVALID'}
                            </div>
                          </div>
                          <div className="p-2.5 bg-transparent border border-ash">
                            <div className="text-foreground type-ui">BIRTH DATE</div>
                            <div className="text-foreground mt-0.5">
                              {turn.toolOutput.valid ? turn.toolOutput.dateOfBirth : 'N/A'}
                            </div>
                          </div>
                          <div className="p-2.5 bg-transparent border border-ash">
                            <div className="text-foreground type-ui">MEMBER AGE</div>
                            <div className="text-foreground mt-0.5">
                              {turn.toolOutput.valid
                                ? `${turn.toolOutput.ageYears} yrs (18+)`
                                : 'N/A'}
                            </div>
                          </div>
                          <div className="p-2.5 bg-transparent border border-ash">
                            <div className="text-foreground type-ui">CITIZENSHIP</div>
                            <div className="text-foreground mt-0.5">
                              {turn.toolOutput.valid ? turn.toolOutput.citizenship : 'N/A'}
                            </div>
                          </div>
                        </div>
                      )}

                      {turn.toolName === 'composeHiggsfieldPrompt' && (
                        <div className="space-y-2 pt-1">
                          <div className="p-3 bg-void border border-ash type-ui font-mono text-foreground leading-relaxed">
                            {turn.toolOutput.prompt}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyText(turn.toolOutput.prompt)}
                            className="inline-flex items-center gap-1.5 type-ui font-mono text-foreground hover:underline"
                          >
                            {copiedPrompt === turn.toolOutput.prompt ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-foreground" />
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
                    <div className=" bg-transparent border border-ash px-4 py-3 type-ui text-foreground leading-relaxed">
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
                    <div className="w-8 h-8 bg-transparent border border-foreground flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-foreground" />
                    </div>
                  )}

                  <div className="max-w-2xl space-y-2.5">
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case 'text':
                          return (
                            <div
                              key={i}
                              className={`px-4 py-3 type-ui leading-relaxed ${
                                message.role === 'user'
                                  ? 'bg-transparent border border-ash text-foreground'
                                  : 'bg-transparent border border-ash text-foreground'
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
                              className="border border-ash bg-void p-3.5 type-ui font-mono space-y-2"
                            >
                              <div className="flex items-center justify-between text-foreground">
                                <span>⚡ {part.type}</span>
                                <span className="type-ui text-foreground">{part.state}</span>
                              </div>
                              {part.state === 'output-available' && (
                                <pre className="type-ui text-foreground overflow-x-auto whitespace-pre-wrap">
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
              <div className="type-ui font-mono text-foreground bg-transparent border border-foreground p-3">
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
            className="p-4 border-t border-ash bg-void flex items-center gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isBusy}
              placeholder="Ask the 420 Cartel Vault Agent to filter strains, calculate courier fees, verify an SA ID, or craft a Higgsfield prompt..."
              className="flex-1 bg-transparent border border-ash focus:border-foreground px-4 py-3 type-ui text-foreground placeholder:text-foreground outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={isBusy || !input.trim()}
              className="inline-flex items-center gap-2 px-5 py-3 bg-foreground hover:bg-foreground/90 disabled:opacity-40 text-background font-medium type-ui transition-all"
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
            className="p-4 border border-ash bg-transparent hover:border-ash flex items-center justify-between group transition-all"
          >
            <div>
              <div className="type-ui font-mono text-foreground">03 · PRIVATE DISPENSARY</div>
              <div className="type-ui text-foreground mt-0.5">Reserve Allocation Catalogue</div>
            </div>
            <ArrowRight className="w-4 h-4 text-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
          </Link>
          <Link
            href="/onboarding"
            className="p-4 border border-ash bg-transparent hover:border-ash flex items-center justify-between group transition-all"
          >
            <div>
              <div className="type-ui font-mono text-foreground">02 · ONBOARDING &amp; PASS</div>
              <div className="type-ui text-foreground mt-0.5">Mint QR/NFC Member Pass</div>
            </div>
            <ArrowRight className="w-4 h-4 text-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
          </Link>
          <Link
            href="/admin/inventory"
            className="p-4 border border-ash bg-transparent hover:border-ash flex items-center justify-between group transition-all"
          >
            <div>
              <div className="type-ui font-mono text-foreground">06 · HIGGSFIELD STUDIO</div>
              <div className="type-ui text-foreground mt-0.5">Generate 9:16 Cultivar Reels</div>
            </div>
            <ArrowRight className="w-4 h-4 text-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
          </Link>
        </footer>
      </div>
    </main>
  );
}
