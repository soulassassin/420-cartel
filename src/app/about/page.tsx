import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About the Collective',
  description:
    '420 Cartel is South Africa premier private cannabis collective and boutique social lounge network in Johannesburg (Norwood, Rivonia, Kibler Park). Strictly 18+ verified members.',
};

const PILLARS = [
  {
    title: 'Small batch craft',
    body: 'Living-soil indoor flower, solventless cold-cure live rosin, and precision sublingual elixirs, cultivated and processed in small artisanal runs.',
  },
  {
    title: 'Strictly metric measured',
    body: 'Every harvest and allocation is logged strictly to the metric system: flower in grams (1g, 3.5g, 7g, 14g, 28g), liquid elixirs in millilitres (5ml, 10ml, 30ml), and edibles by single unit count. Zero imperial measurements.',
  },
  {
    title: 'Private sanctuary',
    body: 'Allocations and social lounge access are strictly reserved for verified adult members aged 18 and older. Strictly No Under 18 permitted on premises.',
  },
];

export default function AboutPage() {
  return (
    <main className="bg-void px-[18px] pb-[78px] md:px-[43px]">
      <section className="grid items-center gap-[27px] py-[78px] lg:grid-cols-[3fr_1fr]">
        <h1 className="display-xl headline-in">
          A private
          <br />
          collective
        </h1>
        <p className="text-[22px] leading-normal lg:justify-self-end lg:text-right text-ash">
          420 Cartel is South Africa&apos;s premier private botanical collective and social lounge network based in Johannesburg.
        </p>
      </section>

      {/* Story & Atmosphere */}
      <section className="mb-[78px] grid gap-8 max-w-4xl text-[22px] leading-relaxed text-ash">
        <p>
          Founded as an authentic private botanical collective, 420 Cartel provides a tranquil sanctuary and private social lounge
          where discerning adults celebrate craft cannabis culture. We operate under the constitutional privacy framework established by
          the Constitutional Court and the Cannabis for Private Purposes Act, ensuring protected adult private consumption for verified members.
        </p>
        <p>
          Our network features boutique social lounges across Johannesburg, including our signature venues in Norwood (62 Grant Ave),
          Rivonia Sandton (353 Rivonia Blvd), and Kibler Park (Shop 9, 14 Stanmore Cres). Each location features comfortable lounge seating,
          terpene smelling jars, dab bar facilities, and expert sommelier guidance.
        </p>
        <p>
          All branches operate daily from 09:00 to 20:00 (9:00 AM to 8:00 PM), seven days a week, welcoming verified adult members with an active digital pass.
        </p>
      </section>

      <section className="grid gap-[43px] md:grid-cols-3 md:gap-[18px]">
        {PILLARS.map((pillar) => (
          <div key={pillar.title} className="border-t border-ash/30 pt-6">
            <h2 className="display-md">{pillar.title}</h2>
            <p className="mt-[13px] text-[20px] leading-normal text-ash">{pillar.body}</p>
          </div>
        ))}
      </section>

      {/* Social Media & Membership Callout */}
      <section className="mt-[78px] flex flex-wrap items-center justify-between gap-6 border-t border-ash/30 pt-[43px]">
        <div>
          <h3 className="font-display text-xl uppercase tracking-wider text-white">Follow the Cartel</h3>
          <p className="mt-2 text-ash text-[18px]">Stay updated on seasonal harvests and private lounge events.</p>
          <div className="mt-4 flex flex-wrap gap-6 text-[18px]">
            <a
              href="https://www.instagram.com/fourtwentycartel/"
              target="_blank"
              rel="noopener noreferrer"
              className="ghost-link"
            >
              Instagram (@fourtwentycartel)
            </a>
            <a
              href="https://www.facebook.com/p/The-Cartel-420-social-lounge-NO-UNDER-18-100041765415684/"
              target="_blank"
              rel="noopener noreferrer"
              className="ghost-link"
            >
              Facebook (The Cartel 420 Social Lounge)
            </a>
          </div>
        </div>

        <p className="text-[22px]">
          <Link href="/onboarding" className="ghost-link">
            Become a member &rarr;
          </Link>
        </p>
      </section>
    </main>
  );
}
