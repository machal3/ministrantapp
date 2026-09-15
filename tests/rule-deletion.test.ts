import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/supabase', () => ({ isDemo: true, supabase: null, configurationError: null }));

import { deleteRule } from '../src/lib/repository';
import { aggregateAttendees } from '../src/lib/attendance';
import { dateKey, shiftDate, weekday, zonedIso } from '../src/lib/dates';
import { readDemo } from '../src/lib/demo';

const KEY = 'liturgy.demo.v1';
const pastDay = shiftDate(dateKey(), -7);
const futureDay = shiftDate(dateKey(), 7);
const dow = weekday(pastDay);

function seed() {
  localStorage.setItem(KEY, JSON.stringify({
    servers: [{ id: 'jan', name: 'Jan Kowalski', rank: 'Lektor' }],
    masses: [
      { id: 'past', start_time: zonedIso(pastDay, '10:30'), title: 'Msza Święta', suggested_spots: 4, is_extra: false },
      { id: 'past-excused', start_time: zonedIso(pastDay, '10:30'), title: 'Msza Święta', suggested_spots: 4, is_extra: false },
      { id: 'future', start_time: zonedIso(futureDay, '10:30'), title: 'Msza Święta', suggested_spots: 4, is_extra: false },
    ],
    rules: [{ id: 'r1', server_id: 'jan', day_of_week: dow, time_slot: '10:30:00' }],
    exceptions: [{ id: 'e1', mass_id: 'past-excused', server_id: 'jan', type: 'excused' }],
  }));
}

beforeEach(() => { localStorage.clear(); });

describe('deleting a recurring duty', () => {
  it('materializes past dates as single signups and drops only future dates', async () => {
    seed();
    await deleteRule('r1');
    const state = readDemo();
    expect(state.rules).toHaveLength(0);
    const byMass = new Map(state.exceptions.map(e => [e.mass_id, e.type]));
    expect(byMass.get('past')).toBe('single');
    expect(byMass.get('past-excused')).toBe('excused');
    expect(byMass.has('future')).toBe(false);
    const visible = aggregateAttendees(state.masses, state.servers, state.rules, state.exceptions);
    expect(visible.map(a => a.mass_id)).toEqual(['past']);
    expect(visible[0].attendance_type).toBe('single');
  });

  it('removes an unknown rule without touching anything', async () => {
    seed();
    await deleteRule('missing');
    expect(readDemo().rules).toHaveLength(1);
    expect(readDemo().exceptions).toHaveLength(1);
  });
});
