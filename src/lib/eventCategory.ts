export function eventCategory(event: { category?: 'mass' | 'devotion' | 'other'; is_extra: boolean }) { return event.category ?? (event.is_extra ? 'devotion' : 'mass'); }
