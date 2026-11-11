import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact & Lounges',
  description:
    'Visit 420 Cartel private cannabis social lounges in Norwood, Rivonia (Sandton), and Kibler Park in Johannesburg. Open daily 09:00 - 20:00.',
};

const BRANCHES = [
  {
    name: 'Norwood Social Lounge',
    address: ['62 Grant Ave, Norwood', 'Johannesburg, Gauteng, 2192'],
    phone: '072 333 0854',
    hours: 'Daily 09:00 - 20:00 (9:00 AM – 8:00 PM)',
  },
  {
    name: 'Rivonia Sandton Vault',
    address: ['353 Rivonia Blvd, Edenburg', 'Sandton, Johannesburg, 2128'],
    phone: '067 755 1674',
    hours: 'Daily 09:00 - 20:00 (9:00 AM – 8:00 PM)',
  },
  {
    name: 'Kibler Park Vault',
    address: ['Shop 9, 14 Stanmore Cres', 'Kibler Park, Johannesburg South, 2091'],
    phone: '082 886 7014',
    hours: 'Daily 09:00 - 20:00 (9:00 AM – 8:00 PM)',
  },
];

export default function ContactPage() {
  return (
    <main className="bg-void px-[18px] pb-[78px] md:px-[43px]">
      <section className="py-[78px]">
        <h1 className="display-xl headline-in">
          Find
          <br />
          the vault
        </h1>
        <p className="mt-6 max-w-2xl text-[22px] leading-relaxed text-ash">
          420 Cartel operates private cannabis social lounges and botanical dispensaries across Johannesburg,
          offering boutique bud bar experiences, vaporisation lounges, and member allocations strictly for verified 18+ members.
          Open daily from 09:00 to 20:00.
        </p>
      </section>

      <section
        aria-label="Branches"
        className="grid gap-[78px] md:grid-cols-2 md:gap-x-[18px] xl:grid-cols-3"
      >
        {BRANCHES.map((branch) => (
          <article key={branch.name} className="text-[22px] leading-normal">
            <h2 className="display-md">{branch.name}</h2>
            <address className="mt-[18px] not-italic">
              {branch.address.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <p className="mt-[13px] text-ash">{branch.hours}</p>
            <p className="mt-[13px] flex flex-wrap gap-x-[27px]">
              <a href={`tel:+27${branch.phone.replace(/\s/g, '').slice(1)}`} className="ghost-link">
                {branch.phone}
              </a>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `420 Cartel ${branch.address.join(', ')}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ghost-link"
              >
                Directions
              </a>
            </p>
          </article>
        ))}
      </section>

      {/* Official Social Media Channels */}
      <section className="mt-[78px] border-t border-ash/30 pt-[43px]">
        <h2 className="display-md">Official Social Media &amp; Support</h2>
        <p className="mt-4 max-w-xl text-[20px] text-ash">
          Connect with 420 Cartel on our official channels for lounge drops, terpene tasting sessions, and private collective updates.
        </p>
        <div className="mt-6 flex flex-wrap gap-6 text-[20px]">
          <a
            href="https://www.instagram.com/fourtwentycartel/"
            target="_blank"
            rel="noopener noreferrer"
            className="ghost-link inline-flex items-center gap-2"
          >
            Instagram (@fourtwentycartel)
          </a>
          <a
            href="https://www.facebook.com/p/The-Cartel-420-social-lounge-NO-UNDER-18-100041765415684/"
            target="_blank"
            rel="noopener noreferrer"
            className="ghost-link inline-flex items-center gap-2"
          >
            Facebook (The Cartel 420 Social Lounge)
          </a>
        </div>
      </section>

      {/* Compliance & Age Restriction Policy */}
      <section className="mt-[43px] rounded-lg border border-ash/20 bg-void/50 p-6 text-[18px] text-ash">
        <p className="font-mono text-sm uppercase tracking-wider text-white">
          Legal Notice &middot; Cannabis for Private Purposes Act Compliance
        </p>
        <p className="mt-2">
          Strictly No Under 18. All visits, social lounge access, and botanical allocations adhere strictly to South African
          private adult consumption constitutional rights. Valid South African ID or passport required for access. Operating hours: Daily 09:00 - 20:00.
        </p>
      </section>
    </main>
  );
}
