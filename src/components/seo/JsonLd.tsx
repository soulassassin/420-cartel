import React from 'react';

/**
 * 420 CARTEL :: Multi-entity Schema.org JSON-LD Structured Data
 *
 * Implements structured data for Search Engine Optimization (SEO),
 * AI Engine Optimization (AIO), and Generative Engine Optimization (GEO).
 * Covers Organization, SocialClub / LocalBusiness branches across Johannesburg,
 * FAQPage for AI query resolution, and BreadcrumbList.
 */
export function JsonLd() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://420cartel.co.za').replace(/\/$/, '');

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: '420 Cartel',
        alternateName: [
          'The Cartel 420',
          'Four Twenty Cartel',
          'The Cartel 420 Social Lounge',
        ],
        url: siteUrl,
        logo: `${siteUrl}/fourtwentycartel_logo.jpg`,
        description:
          "South Africa's premier private cannabis collective and social lounge network, strictly for verified adult members aged 18 and older.",
        sameAs: [
          'https://www.instagram.com/fourtwentycartel/',
          'https://www.facebook.com/p/The-Cartel-420-social-lounge-NO-UNDER-18-100041765415684/',
        ],
        contactPoint: [
          {
            '@type': 'ContactPoint',
            telephone: '+27-72-333-0854',
            contactType: 'customer service',
            areaServed: 'ZA',
            availableLanguage: ['en', 'af'],
          },
        ],
      },
      {
        '@type': 'LocalBusiness',
        '@id': `${siteUrl}/#branch-norwood`,
        name: '420 Cartel — Norwood Social Lounge & Boutique',
        image: `${siteUrl}/fourtwentycartel_logo.jpg`,
        telephone: '072 333 0854',
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '62 Grant Ave',
          addressLocality: 'Norwood',
          addressRegion: 'Gauteng',
          postalCode: '2192',
          addressCountry: 'ZA',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: -26.1578,
          longitude: 28.0772,
        },
        openingHoursSpecification: [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: [
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
              'Sunday',
            ],
            opens: '09:00',
            closes: '20:00',
          },
        ],
      },
      {
        '@type': 'SocialClub',
        '@id': `${siteUrl}/#branch-rivonia`,
        name: '420 Cartel — Rivonia Sandton Vault',
        image: `${siteUrl}/fourtwentycartel_logo.jpg`,
        telephone: '067 755 1674',
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '353 Rivonia Blvd, Edenburg',
          addressLocality: 'Sandton',
          addressRegion: 'Gauteng',
          postalCode: '2128',
          addressCountry: 'ZA',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: -26.0465,
          longitude: 28.0598,
        },
        openingHoursSpecification: [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: [
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
              'Sunday',
            ],
            opens: '09:00',
            closes: '20:00',
          },
        ],
      },
      {
        '@type': 'LocalBusiness',
        '@id': `${siteUrl}/#branch-kibler-park`,
        name: '420 Cartel — Kibler Park Vault',
        image: `${siteUrl}/fourtwentycartel_logo.jpg`,
        telephone: '082 886 7014',
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'Shop 9, 14 Stanmore Cres',
          addressLocality: 'Kibler Park',
          addressRegion: 'Gauteng',
          postalCode: '2091',
          addressCountry: 'ZA',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: -26.3075,
          longitude: 28.0084,
        },
        openingHoursSpecification: [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: [
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
              'Sunday',
            ],
            opens: '09:00',
            closes: '20:00',
          },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${siteUrl}/#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is 420 Cartel?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: "420 Cartel is South Africa's premier private cannabis collective and social lounge network. We provide small-batch indoor craft flower, solventless live rosin, and precision sublingual elixirs strictly for verified adult members aged 18 and older.",
            },
          },
          {
            '@type': 'Question',
            name: 'Who is allowed to enter 420 Cartel lounges and the Vault?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Access is strictly restricted to verified adults aged 18 and over (Strictly No Under 18). Membership onboarding requires valid South African ID or passport verification in accordance with South African privacy and personal cannabis allocation laws.',
            },
          },
          {
            '@type': 'Question',
            name: 'Where are 420 Cartel physical lounges located?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '420 Cartel operates physical lounges and bud bars in Norwood (62 Grant Ave), Rivonia/Sandton (353 Rivonia Blvd), and Kibler Park (Shop 9, 14 Stanmore Cres) in Johannesburg, with express member allocation dispatch to Cape Town and nationwide.',
            },
          },
          {
            '@type': 'Question',
            name: 'What are 420 Cartel operating hours?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'All 420 Cartel lounges and vault pickup locations are open daily from 09:00 to 20:00 (9:00 AM to 8:00 PM), seven days a week.',
            },
          },
          {
            '@type': 'Question',
            name: 'What measurement system does 420 Cartel use?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '420 Cartel strictly standardizes all cannabis product allocations to the metric system: flower and extracts are measured in grams (1g, 3.5g, 7g, 14g, 28g), liquid elixirs and oils in millilitres (5ml, 10ml, 30ml), and edibles in single unit counts.',
            },
          },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${siteUrl}/#breadcrumbs`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${siteUrl}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'About',
            item: `${siteUrl}/about`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'Membership',
            item: `${siteUrl}/onboarding`,
          },
          {
            '@type': 'ListItem',
            position: 4,
            name: 'Vault',
            item: `${siteUrl}/shop`,
          },
          {
            '@type': 'ListItem',
            position: 5,
            name: 'Contact',
            item: `${siteUrl}/contact`,
          },
        ],
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default JsonLd;
