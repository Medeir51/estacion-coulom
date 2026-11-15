/** Editor de código: <textarea> transparente sobre un <pre> resaltado (sección 8.5). */
import { useEffect, useRef, type ReactNode } from 'react';
import { KEYWORDS, normalizeName } from '../../script/lexer';

const TOKEN_RE = /(\/\/[^\n]*)|("[^"\n]*"?|'[^'\n]*'?)|(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_áéíóúüñÁÉÍÓÚÜÑ][\wáéíóúüñÁÉÍÓÚÜÑ]*)|(\n)|([^\n])/g;

export function highlight(src: string, errorLine?: number | null): ReactNode[] {
  const lines: ReactNode[][] = [[]];
  let m: RegExpExecArray | null;
  let key = 0;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(src))) {
    const cur = lines[lines.length - 1];
    if (m[1]) cur.push(<span key={key++} className="tok-com">{m[1]}</span>);
    else if (m[2]) cur.push(<span key={key++} className="tok-str">{m[2]}</span>);
    else if (m[3]) cur.push(<span key={key++} className="tok-num">{m[3]}</span>);
    else if (m[4]) cur.push(KEYWORDS.has(normalizeName(m[4])) ? <span key={key++} className="tok-kw">{m[4]}</span> : m[4]);
    else if (m[5]) lines.push([]);
    else cur.push(m[6]);
  }
  return lines.map((l, i) => (
    <span key={`l${i}`} className={errorLine === i + 1 ? 'tok-errline' : undefined}>
      {l}
      {i < lines.length - 1 ? '\n' : ''}
    </span>
  ));
}

export function CodeEditor(props: {
  value: string;
  onChange?: (v: string) => void;
  errorLine?: number | null;
  onRun?: () => void;
  readOnly?: boolean;
  label: string;
  focusLine?: { line: number; nonce: number } | null;
  style?: React.CSSProperties;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const lineCount = props.value.split('\n').length;
  const { focusLine } = props;

  useEffect(() => {
    if (!focusLine || !ta.current) return;
    const lines = props.value.split('\n');
    let pos = 0;
    for (let i = 0; i < Math.min(focusLine.line - 1, lines.length); i++) pos += lines[i].length + 1;
    ta.current.focus();
    ta.current.setSelectionRange(pos, pos + (lines[focusLine.line - 1]?.length ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusLine]);

  const edit = (next: string, selStart: number, selEnd = selStart) => {
    props.onChange?.(next);
    requestAnimationFrame(() => ta.current?.setSelectionRange(selStart, selEnd));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: t, value } = el;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      props.onRun?.();
      return;
    }
    if (props.readOnly) return;
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      if (e.shiftKey) {
        const block = value.slice(lineStart, t);
        const lines = block.split('\n');
        let removedFirst = 0;
        let removed = 0;
        const out = lines.map((l, i) => {
          const n = l.match(/^ {1,4}/)?.[0].length ?? 0;
          if (i === 0) removedFirst = n;
          removed += n;
          return l.slice(n);
        });
        edit(value.slice(0, lineStart) + out.join('\n') + value.slice(t), Math.max(lineStart, s - removedFirst), t - removed);
      } else if (s !== t && value.slice(s, t).includes('\n')) {
        const block = value.slice(lineStart, t);
        const lines = block.split('\n');
        edit(value.slice(0, lineStart) + lines.map((l) => '    ' + l).join('\n') + value.slice(t), s + 4, t + 4 * lines.length);
      } else {
        edit(value.slice(0, s) + '    ' + value.slice(t), s + 4);
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      let lineEnd = value.indexOf('\n', t);
      if (lineEnd < 0) lineEnd = value.length;
      const lines = value.slice(lineStart, lineEnd).split('\n');
      const allCommented = lines.every((l) => /^\s*\/\//.test(l) || l.trim() === '');
      const out = lines.map((l) => (allCommented ? l.replace(/^(\s*)\/\/ ?/, '$1') : `// ${l}`));
      const next = value.slice(0, lineStart) + out.join('\n') + value.slice(lineEnd);
      edit(next, lineStart, lineStart + out.join('\n').length);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Conserva la sangría de la línea anterior.
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const indent = value.slice(lineStart).match(/^ */)?.[0] ?? '';
      if (indent) {
        e.preventDefault();
        edit(value.slice(0, s) + '\n' + indent + value.slice(t), s + 1 + indent.length);
      }
    }
  };

  return (
    <div className="editor crt" style={props.style}>
      <div className="editor-gutter" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className={props.errorLine === i + 1 ? 'err' : undefined}>
            {i + 1}
          </div>
        ))}
      </div>
      <div className="editor-area">
        <pre aria-hidden="true">
          {highlight(props.value, props.errorLine)}
          {'\n'}
        </pre>
        <textarea
          ref={ta}
          aria-label={props.label}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          readOnly={props.readOnly}
          value={props.value}
          onChange={(e) => props.onChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          data-editor="true"
        />
      </div>
    </div>
  );
}
