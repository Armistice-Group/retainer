// ISO 4217 currency codes the runtime can format (Intl), for the currency
// pickers and validation. Shared by the server and the browser.

const FALLBACK = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "JPY", "SEK", "NOK", "DKK", "INR", "SGD"];

/** Listed first in pickers. */
export const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];

export function supportedCurrencies(): string[] {
  try {
    return Intl.supportedValuesOf("currency");
  } catch {
    return FALLBACK;
  }
}

export function isSupportedCurrency(code: string) {
  return supportedCurrencies().includes(code.toUpperCase());
}

/** "EUR — Euro". */
export function currencyLabel(code: string) {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(code);
    return name && name !== code ? `${code} — ${name}` : code;
  } catch {
    return code;
  }
}
