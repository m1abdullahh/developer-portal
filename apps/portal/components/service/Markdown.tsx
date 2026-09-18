import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders a generated README.
 *
 * On the server, so the parser never ships to the browser. Raw HTML in the source is not
 * rendered — react-markdown's default — which matters less for a README the portal wrote itself
 * than for the one the reconciler will later fetch from a repository anyone can push to.
 *
 * The element styles are spelled out rather than taken from a typography plugin: the portal's
 * whole design is a dozen CSS variables, and a prose stylesheet with its own opinions about
 * colour would be the only thing on the page that ignores them.
 */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h2 className="mt-2 text-xl font-semibold">{children}</h2>,
          h2: ({ children }) => (
            <h3 className="mt-6 border-b pb-1 text-base font-semibold">{children}</h3>
          ),
          h3: ({ children }) => <h4 className="mt-4 text-sm font-semibold">{children}</h4>,
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          a: ({ href, children }) => (
            <a
              href={href}
              // A README's relative links point into a repository, not into the portal.
              {...(href?.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
              className="focus-ring underline underline-offset-4"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 pl-3 text-[hsl(var(--muted-foreground))]">
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-[var(--radius)] border bg-[hsl(var(--muted))] p-3 text-xs [&>code]:bg-transparent [&>code]:p-0">
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="rounded bg-[hsl(var(--muted))] px-1 py-0.5 font-mono text-[0.85em]">
              {children}
            </code>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b px-2 py-1.5 font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b px-2 py-1.5 align-top">{children}</td>,
          hr: () => <hr className="my-4" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
