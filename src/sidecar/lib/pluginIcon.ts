// A plugin's icon is inlined into every payload as a base64 data URI, so an
// oversized SVG bloats the wire and can distort layout. Cap it at a logo-sized
// budget; an icon over the cap is dropped so the UI falls back to the lettermark.
export const MAX_ICON_BYTES = 64 * 1024;

export function svgIconDataUri(svg: string): string | undefined {
  if (Buffer.byteLength(svg, "utf-8") > MAX_ICON_BYTES) return undefined;
  return "data:image/svg+xml;base64," + Buffer.from(svg, "utf-8").toString("base64");
}
