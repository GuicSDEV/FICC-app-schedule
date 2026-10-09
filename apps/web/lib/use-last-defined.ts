import { useState } from "react";

/**
 * The last non-null value seen. Sheets keep rendering their content with it while they animate
 * closed after their target is cleared.
 */
export function useLastDefined<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}
