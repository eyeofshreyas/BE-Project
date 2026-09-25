/** Compact Indian-numbering currency string for large amounts (claim values, exposure
 * totals) -- e.g. "₹2.4 Cr", "₹65.0 L". Amounts under 1 lakh render as a plain grouped
 * rupee figure, since "₹42,000" reads better than a fraction of a lakh. */
export function formatCompactINR(amount: number): string {
  const CRORE = 1_00_00_000
  const LAKH = 1_00_000
  if (amount >= CRORE) return `₹${(amount / CRORE).toFixed(1)} Cr`
  if (amount >= LAKH) return `₹${(amount / LAKH).toFixed(1)} L`
  return `₹${amount.toLocaleString('en-IN')}`
}
