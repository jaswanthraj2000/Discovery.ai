const MIN_YEAR = 1950;

/**
 * Clamp impossible publication years (future-dated / bad metadata) and flag for reranking.
 * Allows calendarYear + 1 for early-print edge cases.
 */
export function sanitizePublicationYear(raw: number | string | null | undefined): {
  year: number;
  suspect: boolean;
} {
  const calendarYear = new Date().getFullYear();
  const maxAllowed = calendarYear + 1;

  let y: number;
  if (typeof raw === "string") {
    const n = parseInt(raw.trim(), 10);
    y = Number.isFinite(n) ? n : calendarYear;
  } else if (typeof raw === "number" && Number.isFinite(raw)) {
    y = Math.floor(raw);
  } else {
    return { year: calendarYear, suspect: true };
  }

  let suspect = false;
  if (y > maxAllowed) {
    suspect = true;
    y = maxAllowed;
  }
  if (y < MIN_YEAR) {
    suspect = true;
    y = MIN_YEAR;
  }
  return { year: y, suspect };
}
