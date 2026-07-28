export function shouldAutostart(json: unknown): boolean {
  if (typeof json !== "object" || json === null) return false;
  return (json as Record<string, unknown>).proxyAutostart === true;
}
