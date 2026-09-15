import { expect, it } from 'vitest';
import { massOccurrenceDates } from '../src/lib/massRecurrence';
const base = { start_date: '2026-01-01', end_date: '2026-03-31', days: [5], frequency: 'monthly' as const, month_weeks: [1] };
it('supports parish monthly patterns and combinations without duplicates', () => {
  expect(massOccurrenceDates(base)).toEqual(['2026-01-02','2026-02-06','2026-03-06']);
  expect(massOccurrenceDates({...base,days:[6]})).toEqual(['2026-01-03','2026-02-07','2026-03-07']);
  expect(massOccurrenceDates({...base,days:[3],month_weeks:[3]})).toEqual(['2026-01-21','2026-02-18','2026-03-18']);
  expect(massOccurrenceDates({...base,start_date:'2028-02-01',end_date:'2028-02-29',days:[0],month_weeks:[5,-1]})).toEqual(['2028-02-27']);
});
it('handles quarterly months and fortnightly cycles through year and DST boundaries', () => {
  expect(massOccurrenceDates({...base,end_date:'2026-12-31',interval_months:3})).toEqual(['2026-01-02','2026-04-03','2026-07-03','2026-10-02']);
  expect(massOccurrenceDates({...base,frequency:'weekly',start_date:'2026-03-22',end_date:'2026-04-19',days:[0],interval_weeks:2})).toEqual(['2026-03-22','2026-04-05','2026-04-19']);
  expect(massOccurrenceDates({...base,start_date:'2026-12-01',end_date:'2027-03-31',interval_months:2})).toEqual(['2026-12-04','2027-02-05']);
});
it('rejects invalid ranges and empty monthly selections without partial previews', () => {
  expect(massOccurrenceDates({...base,end_date:'2028-01-01'})).toEqual([]);
  expect(massOccurrenceDates({...base,month_weeks:[]})).toEqual([]);
  expect(massOccurrenceDates({...base,start_date:''})).toEqual([]);
});
