import { marked } from "marked";
import DOMPurify from "dompurify";

// README links must leave the app: a bare in-page navigation would unload the
// SPA. target=_blank routes the click through the main window-open handler,
// which hands http(s) URLs to the OS browser.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node instanceof Element && node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}
