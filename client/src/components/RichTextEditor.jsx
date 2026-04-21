import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Markdown is the storage format. ReactMarkdown is XSS-safe (no raw HTML
// rendered), and the toolbar just wraps the current selection with the
// matching markdown syntax — no contentEditable / execCommand quirks.

const TOOLBAR = [
  { label: 'B',  title: 'Bold',         wrap: '**' },
  { label: 'I',  title: 'Italic',       wrap: '*'  },
  { label: '“ ”', title: 'Quote',       prefix: '> ' },
  { label: '•',  title: 'Bulleted list', prefix: '- ' },
  { label: '1.', title: 'Numbered list', prefix: '1. ' },
];

export default function RichTextEditor({ value, onChange, placeholder, rows = 5, required = false }) {
  const ref = useRef(null);

  const apply = (action) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const before = value.slice(0, start);
    const sel    = value.slice(start, end);
    const after  = value.slice(end);

    let next, caretStart, caretEnd;
    if (action.wrap) {
      next = before + action.wrap + (sel || action.title) + action.wrap + after;
      caretStart = before.length + action.wrap.length;
      caretEnd   = caretStart + (sel || action.title).length;
    } else if (action.prefix) {
      // Apply prefix to each selected line, or to current line if no selection.
      const target = sel || '';
      const prefixed = target.split('\n').map(l => action.prefix + l).join('\n') ||
        (action.prefix + (action.title.toLowerCase()));
      next = before + prefixed + after;
      caretStart = before.length;
      caretEnd   = before.length + prefixed.length;
    } else { return; }

    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caretStart, caretEnd);
    });
  };

  const insertLink = () => {
    const ta = ref.current;
    if (!ta) return;
    const url = window.prompt('Link URL (https://…)');
    if (!url) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = value.slice(start, end) || 'link';
    const next = value.slice(0, start) + `[${sel}](${url})` + value.slice(end);
    onChange(next);
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 bg-gray-50 text-xs">
        {TOOLBAR.map(b => (
          <button key={b.label} type="button" onClick={() => apply(b)} title={b.title}
            className="px-2 py-1 rounded hover:bg-white text-gray-700 font-medium">
            {b.label}
          </button>
        ))}
        <button type="button" onClick={insertLink} title="Insert link"
          className="px-2 py-1 rounded hover:bg-white text-gray-700">🔗</button>
        <span className="ml-auto text-[10px] text-gray-400 pr-1">Markdown supported</span>
      </div>
      <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} rows={rows}
        required={required} placeholder={placeholder}
        className="w-full px-3 py-2 text-sm focus:outline-none resize-y" />
    </div>
  );
}

export function RichTextDisplay({ value }) {
  if (!value) return null;
  return (
    <div className="prose prose-sm max-w-none text-gray-800 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-blockquote:my-1 prose-a:text-primary-600">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
    </div>
  );
}
