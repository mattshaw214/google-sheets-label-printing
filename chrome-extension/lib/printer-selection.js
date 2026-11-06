function normalizedNames(printerNames) {
  if (!Array.isArray(printerNames)) {
    throw new Error('The local printer helper returned an invalid printer list');
  }
  return [...new Set(
    printerNames
      .map((name) => String(name).trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

function ambiguity(label, names) {
  throw new Error(
    `Multiple ${label} printers were found: ${names.join(', ')}. Remove unused duplicate queues.`,
  );
}

export function selectCompatiblePrinter(printerNames, cachedPrinterName = '') {
  const names = normalizedNames(printerNames);
  const cached = String(cachedPrinterName || '').trim();
  if (cached && names.includes(cached)) return cached;

  const modelMatches = names.filter(
    (name) => /\bZD\s*2(?:20|30)\b/i.test(name.replaceAll('_', ' ')),
  );
  if (modelMatches.length === 1) return modelMatches[0];
  if (modelMatches.length > 1) ambiguity('ZD220 or ZD230', modelMatches);

  const zebraMatches = names.filter((name) => /zebra/i.test(name));
  if (zebraMatches.length === 1) return zebraMatches[0];
  if (zebraMatches.length > 1) ambiguity('Zebra', zebraMatches);

  throw new Error(
    'No installed ZD220 or ZD230 printer was found. '
    + 'Install the Zebra driver and connect the printer.',
  );
}
