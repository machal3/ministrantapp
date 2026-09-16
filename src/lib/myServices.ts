import { attendanceState } from './attendance';
import type { ScheduleData } from '../types/database';

export function personalServices(data: ScheduleData, serverId: string, now: Date) {
  const rosters = new Map<string, ScheduleData['attendees']>();
  for (const attendee of data.attendees) {
    const roster = rosters.get(attendee.mass_id) ?? [];
    roster.push(attendee);
    rosters.set(attendee.mass_id, roster);
  }
  return data.masses.filter(mass => Date.parse(mass.start_time) >= now.getTime())
    .map(mass => ({ mass, attendees: rosters.get(mass.id) ?? [], ...attendanceState(mass, serverId, data.rules, data.exceptions) }))
    .filter(service => service.excused || service.attendees.some(person => person.server_id === serverId))
    .sort((a, b) => Date.parse(a.mass.start_time) - Date.parse(b.mass.start_time) || a.mass.id.localeCompare(b.mass.id));
}

export type PersonalService = ReturnType<typeof personalServices>[number];
