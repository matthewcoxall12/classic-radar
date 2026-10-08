export default function LoadingEvents() {
  return (
    <section
      className="page-shell finder-page"
      role="status"
      aria-live="polite"
    >
      <p className="eyebrow">The calendar</p>
      <h1 className="font-serif text-5xl mb-8">Finding your next day out…</h1>
      <div className="event-grid" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="loading-card">
            <div />
            <div />
            <div />
          </div>
        ))}
      </div>
    </section>
  );
}
