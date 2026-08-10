// The token list is read back out of the loaded stylesheet rather than duplicated here,
// so the gallery shows whatever app.css currently defines.

function collect(rules: CSSRuleList, into: Set<string>): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSGroupingRule) {
      collect(rule.cssRules, into);
      continue;
    }
    if (!(rule instanceof CSSStyleRule) || !rule.selectorText.includes(":root")) continue;
    for (const property of Array.from(rule.style)) {
      if (property.startsWith("--")) into.add(property);
    }
  }
}

export function rootTokenNames(): string[] {
  const names = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collect(sheet.cssRules, names);
    } catch {
      // A stylesheet from another origin cannot be read; there are none in the gallery build.
    }
  }
  return [...names].sort();
}

export function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
