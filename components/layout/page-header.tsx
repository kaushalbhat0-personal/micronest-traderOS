/**
 * Page heading block. Renders the page's only `<h1>`; sections below use
 * `<h2>` and cards/items use `<h3>`.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="max-w-2xl space-y-3">
      {eyebrow ? <p className="type-eyebrow text-ink-muted">{eyebrow}</p> : null}
      <h1 className="type-title">{title}</h1>
      {description ? <p className="type-body text-ink-muted">{description}</p> : null}
    </header>
  );
}
