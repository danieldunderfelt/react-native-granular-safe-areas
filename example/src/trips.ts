export type Trip = {
  when: string;
  route: string;
  detail: string;
  color: string;
  code: string;
  gate: string;
  seat: string;
};

export const TRIPS: Trip[] = [
  {
    when: 'Tomorrow',
    route: 'Helsinki – Lisbon',
    detail: 'Direct · Wed 18 Nov · 16:40',
    color: '#2f6f8f',
    code: 'LIS',
    gate: '32',
    seat: '14A',
  },
  {
    when: 'December',
    route: 'Lisbon – Funchal',
    detail: 'Direct · Fri 4 Dec · 09:15',
    color: '#8f5a2f',
    code: 'FNC',
    gate: '12',
    seat: '3C',
  },
  {
    when: 'January',
    route: 'Funchal – Helsinki',
    detail: '1 stop · Sun 10 Jan · 12:05',
    color: '#4b2f8f',
    code: 'HEL',
    gate: '7',
    seat: '22F',
  },
];
