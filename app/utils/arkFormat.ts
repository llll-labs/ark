/**
 * Shared market-job formatting helpers. Auto-imported from `utils/`.
 */

/**
 * Format a job's budget as "amount currency", or `fallback` when unset.
 * This util is locale-agnostic; callers pass a translated fallback (e.g.
 * `$t('jobs.card.budgetNotSpecified')`) since pure utils have no i18n context.
 */
export function formatBudget(
  job: { budgetAmount?: number | string | null, budgetCurrency?: string | null } | null | undefined,
  fallback = '',
): string {
  if (!job?.budgetAmount)
    return fallback
  return [job.budgetAmount, job.budgetCurrency].filter(Boolean).join(' ')
}

/**
 * Format a date for the market UI. Defaults to "day month" (no year);
 * pass `{ year: 'numeric' }` to include the year (used on the job detail page).
 */
export function formatDate(
  value: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  if (!value)
    return ''
  return new Intl.DateTimeFormat(locale || undefined, { day: '2-digit', month: 'short', ...opts }).format(new Date(value))
}
