const formatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number) {
  return formatter.format(value);
}

export function formatGroszToPln(grosz: number) {
  return formatCurrency(grosz / 100);
}
