/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Checks if a Trello due date is in the past.
 */
export function isPastDue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(dateStr);
    return dueDate < today;
  } catch {
    return false;
  }
}

/**
 * Formats an ISO 8601 date string to a human-readable format.
 */
export function formatDateString(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const matches = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (matches) {
      const [_, year, month, day] = matches;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}
