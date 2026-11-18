import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const marked = new Marked({
  gfm: true,
  breaks: true,
});

/** 渲染 Markdown 并消毒，避免 XSS */
export function renderMarkdown(text) {
  const raw = marked.parse(String(text ?? ''));
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'title'],
  });
}
