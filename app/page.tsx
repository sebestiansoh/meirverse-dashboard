export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-paper text-ink p-8">
      <div className="max-w-xl text-center space-y-6">
        <p className="font-sans text-xs uppercase tracking-[0.2em] text-muted">
          Meirverse Dashboard
        </p>
        <h1 className="font-serif text-4xl sm:text-5xl leading-tight">
          The orchestration layer for the Meirverse group.
        </h1>
        <p className="font-sans text-sm text-muted">
          Phase 2.1 · Foundation deployed. Identity, universal modules, and the
          CRM bridge arrive in the coming phases.
        </p>
        <p className="font-sans text-xs text-muted/60 pt-8">
          dashboard.meirverse.app
        </p>
      </div>
    </main>
  );
}
