const paths = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  utensils: '<path d="M5 3v6a3 3 0 0 0 6 0V3M8 3v18m11 0V3c-4 2-4 9 0 9"/>',
  moon: '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',
  coffee: '<path d="M4 8h13v6a6 6 0 0 1-12 0V8m12 0h1a3 3 0 0 1 0 6h-1M3 21h16M8 2v2m5-2v2"/>',
  book: '<path d="M12 5v16m0-16C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1Z"/>',
  dumbbell: '<path d="m7 7 10 10M3 9l6-6m6 18 6-6M2 6l4-4m12 20 4-4M5 11l6-6m2 14 6-6"/>',
  languages: '<path d="M3 5h12M9 2v3m4 0c-1 6-4 10-10 13m2-10c1 4 4 7 7 9m1 4 4.5-11L22 21m-7.5-4h6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  edit: '<path d="m16 3 5 5M4 15 17 2l5 5L9 20l-6 1 1-6Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  timeline: '<path d="M6 5v14m5-13h9m-9 6h7m-7 6h9"/><circle cx="6" cy="4" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="6" cy="20" r="1.5"/>',
  chart: '<path d="M4 20V10m8 10V4m8 16v-7"/>',
  leaf: '<path d="M20 4C8 2 2 10 7 16c6 5 14-1 13-12ZM5 20l10-10"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4"/>',
  note: '<path d="M14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-7-7Zm0 0v7h7M7 13h10M7 17h7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  shield: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Z"/><path d="m8 12 3 3 5-6"/>',
};

export const activityIcons = ['sun', 'utensils', 'moon', 'coffee', 'book', 'dumbbell', 'languages', 'users', 'leaf', 'sparkles'];

export function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkles}</svg>`;
}
