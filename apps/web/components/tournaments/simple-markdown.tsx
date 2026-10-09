import { Fragment, type ReactNode } from "react";

/** Inline marks: **bold**, *italic* and [text](https://link). */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("(") + 1, -1);
      nodes.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-ink underline underline-offset-4"
        >
          {label}
        </a>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = start + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * The tournament's rules text in a small, safe Markdown subset: paragraphs, "- " lists, **bold**,
 * *italic* and http(s) links. Everything else is plain text (no HTML is ever injected).
 */
export function SimpleMarkdown({ source, className }: { source: string; className?: string }) {
  const blocks = source.trim().split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={blockIndex} className="my-2 list-disc space-y-1 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  {inline(line.replace(/^\s*[-*]\s+/, ""), `${blockIndex}-${lineIndex}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={blockIndex} className="my-2">
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {inline(line, `${blockIndex}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
