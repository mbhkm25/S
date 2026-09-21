import { Fragment, type ReactNode } from 'react';

type InlinePart = ReactNode;

function safeHref(value: string): string | null {
  const href = value.trim();
  if (/^(https?:\/\/|mailto:|\/)/i.test(href)) return href;
  return null;
}

function inline(text: string): InlinePart[] {
  const out: InlinePart[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];

    if (token.startsWith('`') && token.endsWith('`')) {
      out.push(<code key={`code-${key++}`} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') && token.endsWith('**')) {
      out.push(<strong key={`strong-${key++}`} className="font-semibold text-slate-950">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      out.push(<em key={`em-${key++}`}>{token.slice(1, -1)}</em>);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = linkMatch ? safeHref(linkMatch[2]) : null;
      if (linkMatch && href) {
        out.push(
          <a
            key={`link-${key++}`}
            href={href}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel={href.startsWith('http') ? 'noreferrer' : undefined}
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-500"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        out.push(token);
      }
    }
    last = pattern.lastIndex;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(lines: string[]): ReactNode[] {
  return lines.flatMap((line, index) => (
    index === 0
      ? inline(line)
      : [<br key={`br-${index}`} />, ...inline(line)]
  ));
}

export default function SanadConversationMarkdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${key++}`} className="my-4 border-0 border-t border-slate-200" />);
      index += 1;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      const classes = level === 1
        ? 'mt-5 mb-2 text-base font-semibold leading-7 text-slate-950'
        : level === 2
          ? 'mt-4 mb-2 text-[15px] font-semibold leading-7 text-slate-950'
          : 'mt-3 mb-1.5 text-sm font-semibold leading-6 text-slate-900';
      const Tag = (level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5') as 'h3' | 'h4' | 'h5';
      blocks.push(<Tag key={`h-${key++}`} className={classes}>{inline(heading[2])}</Tag>);
      index += 1;
      continue;
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-+*]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push(
        <ul key={`ul-${key++}`} className="my-3 list-disc space-y-1.5 pr-5 text-sm leading-7 text-slate-800 marker:text-slate-400 md:text-[15px]">
          {items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}
        </ul>,
      );
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push(
        <ol key={`ol-${key++}`} className="my-3 list-decimal space-y-1.5 pr-5 text-sm leading-7 text-slate-800 marker:text-slate-500 md:text-[15px]">
          {items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}
        </ol>,
      );
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      if (!next.trim()) break;
      if (/^\s{0,3}(#{1,6})\s+/.test(next)) break;
      if (/^\s*[-+*]\s+/.test(next)) break;
      if (/^\s*\d+[.)]\s+/.test(next)) break;
      if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push(
      <p key={`p-${key++}`} className="my-2 text-sm leading-7 text-slate-800 md:text-[15px]">
        {withBreaks(paragraph)}
      </p>,
    );
  }

  return <Fragment>{blocks}</Fragment>;
}
