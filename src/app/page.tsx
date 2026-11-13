import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import Link from 'next/link';
import { CountUp } from '@/components/home/CountUp';
import { PlantLoop } from '@/components/home/PlantLoop';
import { Reveal, RevealImage } from '@/components/ui/RevealImage';
import { PUBLIC_BRANCHES } from '@/lib/branches';

/**
 * 420 CARTEL :: landing page
 *
 * The brand mark (in the header) is the focal anchor, left-aligned above the
 * oversized headline. Then: marquee, value grid, proof metrics, the product wall, the
 * range, membership steps, testimonials, service, branches, closing action.
 *
 * Spacing is 8pt throughout, using Tailwind steps 2/4/6/8/12/16/24 only.
 * Every section opens with the same top padding (SECTION) and has no bottom
 * padding, so the gap between any two sections is one consistent value.
 *
 * Type hierarchy: section-label (14px caps, gold) > display title (white) >
 * body (20px, grey) > action (.btn, or a ghost link). Gold is the one accent:
 * labels, the marquee rules, the metric figures and hover states.
 */

// Listed row by row. Every tile shares one shape so rows and columns align.
const TILES = [
  { name: 'Black Truffle Gold', tagline: 'Indoor craft indica. Trichome-drenched.', slug: 'black-truffle-gold' },
  { name: 'Candy Games #38', tagline: 'Chunky indoor craft bud. Heavy frost.', slug: 'candy-games-38' },
  { name: 'Hydroponic RS-11', tagline: 'Deep water culture. Diamond trichome frost.', slug: 'hydro-rs11' },
  { name: 'Valley Sun Tangie', tagline: 'Sun-grown greenhouse. Sweet citrus zest.', slug: 'valley-sun-tangie' },
  { name: 'Jozi Lemon Haze', tagline: 'Bright daylight sativa. Citrus-forward.', slug: 'jozi-lemon-haze' },
  { name: 'Hydro Mac 1', tagline: 'Closed-loop hydro craft. White-out frost.', slug: 'hydro-mac1' },
  { name: 'Obsidian Rosin Dropper', tagline: 'Solventless live rosin in MCT. Sublingual.', slug: 'obsidian-rosin-dropper' },
  { name: 'Imperial Hash Hole', tagline: '2g donut-rolled, temple-hash-cored.', slug: 'imperial-hash-hole' },
  { name: '24K Gold Dust Truffles', tagline: '10mg per truffle. Edible gold leaf.', slug: '24k-gold-dust-truffles' },
];

const RANGE = [
  { title: 'Flower', detail: 'Greenhouse, indoor and hydro small-batch craft flower.', sizes: '1g · 3.5g · 7g · 28g', slug: 'candy-games-38' },
  { title: 'Elixirs', detail: 'Solventless rosin and broad-spectrum CBD, dosed by the millilitre.', sizes: '5ml · 10ml · 30ml', slug: 'obsidian-rosin-dropper' },
  { title: 'Pre-rolls', detail: 'Hand-rolled and hash-cored, finished with a glass tip.', sizes: 'Singles and packs', slug: 'imperial-hash-hole' },
  { title: 'Edibles', detail: 'Dark chocolate truffles, precisely dosed and boxed in sixes.', sizes: '10mg per truffle', slug: '24k-gold-dust-truffles' },
];

const STEPS = [
  { title: 'Verify', detail: 'Confirm you are 18 or over with your SA ID or passport.' },
  { title: 'Sign', detail: 'Sign the membership agreement and add your documents.' },
  { title: 'Enter', detail: 'Get your QR member pass and walk straight into the Vault.' },
];

const SERVICE = [
  { title: 'In-store pick-up', detail: 'Order ahead and collect from your branch.' },
  { title: 'Local delivery', detail: 'Express delivery for members in range of a branch.' },
  { title: 'Member pass', detail: 'One QR pass online and at the counter, earning points on every order.' },
];

const VALUES = [
  {
    title: 'Small batch',
    detail: 'Indoor craft flower and solventless rosin, produced in limited runs and allocated rather than stockpiled.',
  },
  {
    title: 'Private by design',
    detail: 'A closed collective. Every member is ID-verified as 18 or over and signs the membership agreement before entry.',
  },
  {
    title: 'Three lounges',
    detail: 'Norwood, Rivonia and Kibler Park. One membership is recognised at every counter and online.',
  },
];

// Every figure is derived from site data or the published trading hours.
const METRICS = [
  { value: PUBLIC_BRANCHES.length, suffix: '', label: 'Lounges across Johannesburg' },
  { value: RANGE.length, suffix: '', label: 'Product lines in the range' },
  { value: 7, suffix: '', label: 'Days a week, 9 am to 8 pm' },
  { value: 18, suffix: '+', label: 'Verified members only' },
];

/*
 * PLACEHOLDER COPY. These quotes are samples that show the layout; they are
 * not real member reviews. While TESTIMONIALS_ARE_PLACEHOLDER is true the
 * section renders in development only and is left out of production builds.
 * Replace the entries with real, consented member quotes, then set it false.
 */
const TESTIMONIALS_ARE_PLACEHOLDER = true;
const TESTIMONIALS = [
  {
    quote: 'Sample quote. The flower is consistently the best I have had in Joburg, and the lounge feels like a members club, not a shop.',
    name: 'Sample member',
    detail: 'Norwood',
  },
  {
    quote: 'Sample quote. Sign-up took a few minutes and my pass worked at the counter the same day.',
    name: 'Sample member',
    detail: 'Rivonia',
  },
  {
    quote: 'Sample quote. Ordering ahead and collecting on the way home has become my routine.',
    name: 'Sample member',
    detail: 'Kibler Park',
  },
];
const SHOW_TESTIMONIALS =
  TESTIMONIALS.length > 0 && (!TESTIMONIALS_ARE_PLACEHOLDER || process.env.NODE_ENV !== 'production');

const MARQUEE = [
  'Small batch',
  'Strictly 18+',
  'Social Lounge',
  'Craft Flower',
  'Solventless Rosin',
  'Elixirs',
  'Johannesburg',
  'Norwood',
  'Rivonia',
  'Kibler Park',
  'Members only',
];

const FOOTER_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Membership', href: '/onboarding' },
  { label: 'Vault', href: '/shop' },
  { label: 'Contact', href: '/contact' },
];

function LeafGlyph() {
  return (
    <span aria-hidden="true" className="inline-flex items-center align-baseline text-gold">
      <span className="font-sans font-light">(</span>
      <svg viewBox="0 0 100 100" className="mx-[0.06em] inline-block h-[0.72em] w-[0.72em] fill-current">
        <path d="M50 4c7 15 10 32 7 49 7-13 18-23 33-29-4 17-14 31-29 41 10-3 21-3 32 1-11 8-24 11-37 8 5 3 9 7 12 12-9 1-17-2-23-8l2 18h-6l2-18c-6 6-14 9-23 8 3-5 7-9 12-12-13 3-26 0-37-8 11-4 22-4 32-1C24 55 14 41 10 24c15 6 26 16 33 29-3-17 0-34 7-49Z" />
      </svg>
      <span className="font-sans font-light">)</span>
    </span>
  );
}

/** Arrow that nudges right when its button or `group` parent is hovered. */
function ArrowGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 60"
      className="btn-arrow inline-block h-[0.55em] w-[1.1em] fill-none stroke-current"
      strokeWidth="2"
    >
      <path d="M0 30h116M88 2l30 28-30 28" />
    </svg>
  );
}

function Marquee() {
  // Two identical halves, so the -50% loop point is invisible.
  const items = [...MARQUEE, ...MARQUEE];
  return (
    <div aria-hidden="true" className="-mx-4 overflow-hidden border-y border-gold py-4 md:-mx-12">
      <div className="marquee-track flex w-max">
        {[...items, ...items].map((item, index) => (
          <span key={index} className="flex items-center font-display text-[40px] uppercase leading-none">
            <span className="px-6">{item}</span>
            <span className="font-sans font-light text-gold">*</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Even product wall: two equal columns, then three from xl. Every tile has the
 * same 3:4 frame, so image tops, image bottoms and captions line up per row.
 * Each tile flashes once as it scrolls in, and lifts, zooms and flashes on hover.
 */
function TileWall() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-y-12 xl:grid-cols-3">
      {TILES.map((tile, index) => (
        <Reveal key={tile.slug} delay={(index % 3) * STAGGER}>
          <Link href="/shop" className="tile group block">
            <div className="tile-frame aspect-[3/4]">
              <div className="tile-media relative size-full">
                <RevealImage
                  src={`/products/${tile.slug}.webp`}
                  alt={tile.name}
                  sizes="(max-width: 1280px) 50vw, 33vw"
                />
              </div>
            </div>
            <p className="mt-3 text-base leading-tight sm:mt-4 sm:text-xl">{tile.name}</p>
            <p className="tile-tagline mt-1 text-sm text-ash sm:mt-0 sm:text-base">{tile.tagline}</p>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}

/** Grey label, then the display title. Opens every section. */
function SectionHeader({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Reveal>
      <p className="section-label">{label}</p>
      <h2 className="display-lg mt-4">{children}</h2>
    </Reveal>
  );
}

// One top padding for every section; the gap between sections is always this.
const SECTION = 'pt-16 md:pt-24';
const THREE_UP = 'grid gap-12 md:grid-cols-3 md:gap-4';
const BODY = 'text-xl text-ash';
const STAGGER = 120;

export default function LandingPage() {
  return (
    <main className="overflow-x-clip bg-void px-4 md:px-12">
      {/* The plant hangs behind the intro copy on the right, as before. It is
          held to the hero and marquee so it does not run into the value cards. */}
      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute -right-4 top-0 z-0 h-full md:-right-12">
          <PlantLoop className="h-full w-auto max-w-none opacity-60 md:opacity-75" />
        </div>

        <section className="relative z-10 grid min-h-[70vh] items-center gap-6 py-16 md:py-24 lg:grid-cols-[3fr_1fr]">
          <h1 className="display-xl headline-in">
            Small <LeafGlyph /> batch
            <br />
            flower &amp; rosin
            <br />
            members <ArrowGlyph /> only<span className="font-sans font-light">*</span>
          </h1>
          <p className="text-[22px] leading-normal lg:justify-self-end lg:text-right">
            A private cannabis collective and social lounge network in Johannesburg. Allocated to verified 18+ members for adult private consumption.{' '}
            <Link href="/onboarding" className="ghost-link">
              Join the Cartel
            </Link>
          </p>
        </section>

        <div className="relative z-10">
          <Marquee />
        </div>
      </div>

      {/* Value proposition: three equal cards */}
      <section className={SECTION}>
        <SectionHeader label="Why the Cartel">
          Grown small.
          <br />
          Kept private.
        </SectionHeader>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {VALUES.map((value, index) => (
            <Reveal key={value.title} delay={index * STAGGER} className="h-full">
              <article className="lift h-full border border-ash p-6 md:p-8">
                <p className="section-label">0{index + 1}</p>
                <h3 className="display-md mt-12">{value.title}</h3>
                <p className={`mt-4 ${BODY}`}>{value.detail}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Proof metrics: each figure counts up once on entry */}
      <section aria-label="The Cartel in numbers" className={SECTION}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-12 border-y border-ash py-12 md:grid-cols-4 md:py-16">
          {METRICS.map((metric, index) => (
            <Reveal key={metric.label} delay={index * STAGGER} className="flex flex-col-reverse justify-end">
              <dt className="section-label mt-4">{metric.label}</dt>
              <dd className="font-display text-[clamp(4rem,9vw,8rem)] leading-none text-gold">
                <CountUp value={metric.value} />
                {metric.suffix}
              </dd>
            </Reveal>
          ))}
        </dl>
      </section>

      <section className={SECTION}>
        <SectionHeader label="The reserve">On the shelf</SectionHeader>
        <div className="mt-12">
          <TileWall />
        </div>
      </section>

      <section className={`grid gap-12 lg:grid-cols-[1fr_2fr] ${SECTION}`}>
        <div>
          <div className="lg:sticky lg:top-12">
            <SectionHeader label="Four lines">
              The
              <br />
              range
            </SectionHeader>
          </div>
        </div>
        <ul className="divide-y divide-ash border-y border-ash">
          {RANGE.map((item, index) => (
            <li key={item.title}>
              <Reveal className="grid items-center gap-4 py-8 sm:grid-cols-[1fr_160px]">
                <div>
                  <p className="section-label">0{index + 1}</p>
                  <h3 className="display-md mt-4">{item.title}</h3>
                  <p className={`mt-4 ${BODY}`}>{item.detail}</p>
                  <p className="mt-2 text-base">{item.sizes}</p>
                </div>
                <div className="relative aspect-[3/4] w-40 overflow-hidden">
                  <RevealImage src={`/products/${item.slug}.webp`} alt="" sizes="160px" />
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section className={SECTION}>
        <SectionHeader label="Membership">
          In <span className="display-outline">three</span> steps
        </SectionHeader>
        <div className={`mt-12 ${THREE_UP}`}>
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * STAGGER}>
              <p className="display-outline font-display text-[clamp(6rem,12vw,11rem)] leading-none">
                0{index + 1}
              </p>
              <h3 className="display-md mt-4">{step.title}</h3>
              <p className={`mt-4 ${BODY}`}>{step.detail}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-12">
          <Link href="/onboarding" className="btn btn-primary">
            Become a member <ArrowGlyph />
          </Link>
        </Reveal>
      </section>

      <div className="relative -mx-4 mt-16 aspect-[16/9] overflow-hidden md:-mx-12 md:mt-24 md:aspect-[21/9]">
        <RevealImage src="/products/lineup.webp" alt="The 420 Cartel range laid out in a row" sizes="100vw" />
      </div>

      {/* Testimonials: one lead quote, two supporting */}
      {SHOW_TESTIMONIALS && (
        <section className={SECTION}>
          <SectionHeader label="From the lounge">Member word</SectionHeader>
          <div className="mt-12 grid gap-4 lg:grid-cols-[2fr_1fr]">
            {TESTIMONIALS.slice(0, 1).map((item) => (
              <Reveal key={item.quote} className="h-full">
                <figure className="lift flex h-full flex-col justify-between gap-12 border border-ash p-6 md:p-12">
                  <blockquote className="text-[clamp(1.5rem,3vw,2.75rem)] leading-tight">
                    &ldquo;{item.quote}&rdquo;
                  </blockquote>
                  <figcaption className="section-label">
                    <span className="text-foreground">{item.name}</span> &middot; {item.detail}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
            <div className="grid gap-4">
              {TESTIMONIALS.slice(1, 3).map((item, index) => (
                <Reveal key={item.quote} delay={(index + 1) * STAGGER} className="h-full">
                  <figure className="lift flex h-full flex-col justify-between gap-8 border border-ash p-6 md:p-8">
                    <blockquote className="text-xl">&ldquo;{item.quote}&rdquo;</blockquote>
                    <figcaption className="section-label">
                      <span className="text-foreground">{item.name}</span> &middot; {item.detail}
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className={SECTION}>
        <SectionHeader label="Service">How you get it</SectionHeader>
        <div className={`mt-12 ${THREE_UP}`}>
          {SERVICE.map((item, index) => (
            <Reveal key={item.title} delay={index * STAGGER} className="border-t border-ash pt-6">
              <h3 className="display-md">{item.title}</h3>
              <p className={`mt-4 ${BODY}`}>{item.detail}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className={SECTION}>
        <SectionHeader label="Branches">Find us</SectionHeader>
        <ul className="mt-12 divide-y divide-ash border-y border-ash">
          {PUBLIC_BRANCHES.map((branch) => (
            <li key={branch.name}>
              <Reveal className="grid items-baseline gap-2 py-8 text-xl md:grid-cols-[2fr_2fr_1fr] md:gap-4">
                <h3 className="display-md">{branch.name}</h3>
                <p className="text-ash">{branch.address.join(', ')}</p>
                <p className="md:text-right">{branch.hours}</p>
              </Reveal>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xl">
          <Link href="/contact" className="ghost-link">
            All contact details
          </Link>
        </p>
      </section>

      <section className={SECTION}>
        <Link href="/onboarding" className="group block">
          <Reveal>
            <p className="section-label">Verified 18+ members only</p>
            <p className="display-xl mt-4 decoration-ash decoration-1 underline-offset-[0.12em] group-hover:underline">
              Join the Cartel <ArrowGlyph />
            </p>
          </Reveal>
        </Link>
      </section>

      <footer className="overflow-hidden pb-4 pt-16 md:pt-24">
        <BrandLogo className="mb-8" />
        <div className="flex flex-wrap justify-between gap-x-12 gap-y-4 text-base">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="ghost-link">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <a
              href="https://www.instagram.com/fourtwentycartel/"
              target="_blank"
              rel="noopener noreferrer"
              className="ghost-link"
            >
              Instagram
            </a>
            <a
              href="https://www.facebook.com/p/The-Cartel-420-social-lounge-NO-UNDER-18-100041765415684/"
              target="_blank"
              rel="noopener noreferrer"
              className="ghost-link"
            >
              Facebook
            </a>
          </div>
          <p className="text-ash">
            Daily 09:00 - 20:00 &middot; Strictly 18+ verified members only. Cannabis for Private Purposes Act compliance. Johannesburg, ZA.
          </p>
        </div>
        <p className="mt-10 border-t border-[color:var(--border-mono)] pt-6 text-sm text-ash">
          Designed and distributed by{' '}
          <a
            href="https://synapsesnetworking.com"
            target="_blank"
            rel="noopener noreferrer"
            className="ghost-link text-white"
          >
            Synapses Networking
          </a>
        </p>
      </footer>
    </main>
  );
}
