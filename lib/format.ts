export const compact = (value: number, digits = 1) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: digits }).format(value);

export const money = (value: number, digits = 1) => `$${compact(value, digits)}`;

export const percent = (value: number, digits = 2) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
