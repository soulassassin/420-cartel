/**
 * Public branch directory for the Contact page, taken from the Google Business
 * listings. The `branches` table still drives POS, stock and delivery.
 */

export interface PublicBranch {
  name: string;
  address: string[];
  phone: string;
  hours: string;
}

export const PUBLIC_BRANCHES: PublicBranch[] = [
  {
    name: 'Norwood',
    address: ['62 Grant Ave, Norwood', 'Johannesburg, 2192'],
    phone: '072 333 0854',
    hours: 'Daily 9 am to 8 pm',
  },
  {
    name: 'Rivonia',
    address: ['353 Rivonia Blvd, Edenburg', 'Sandton, 2128'],
    phone: '067 755 1674',
    hours: 'Daily 9 am to 8 pm',
  },
  {
    name: 'Kibler Park',
    address: ['Shop 9, 14 Stanmore Cres', 'Kibler Park, Johannesburg South'],
    phone: '082 886 7014',
    hours: 'Daily 9 am to 8 pm',
  },
];
