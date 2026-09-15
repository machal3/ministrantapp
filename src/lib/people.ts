export function peopleWord(count: number): string {
  if (count === 1) return 'osoba';
  return count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14) ? 'osoby' : 'osób';
}
