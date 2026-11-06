export const PROFILES = Object.freeze({
  epl203: Object.freeze({
    id: 'epl203',
    language: 'epl',
    dpi: 203,
    width: 368,
    height: 406,
  }),
  zpl203: Object.freeze({
    id: 'zpl203',
    language: 'zpl',
    dpi: 203,
    width: 368,
    height: 406,
  }),
  zpl300: Object.freeze({
    id: 'zpl300',
    language: 'zpl',
    dpi: 300,
    width: 544,
    height: 600,
  }),
});

export const LIMITS = Object.freeze({
  labelWidthInches: 2,
  labelHeightInches: 0.75,
  labelsAcross: 2,
  maxPrintQty: 10_000,
  maxJobTotal: 100_000,
  maxFoodLineChars: 28,
  maxHeaderChars: 30,
});
