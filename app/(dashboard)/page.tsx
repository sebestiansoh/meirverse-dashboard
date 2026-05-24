export default function Home() {
  return (
    <main className="flex items-center justify-center px-8 py-20">
      <div className="max-w-xl text-center space-y-6">
        <h1 className="font-serif text-4xl sm:text-5xl leading-tight">
          Welcome to the Meirverse Dashboard.
        </h1>
        <p className="font-sans text-sm text-muted">
          Phase 2.2 · Auth gate live. Universal modules — calendar, tasks,
          inbox, markets, quick launch, directory — arrive across Phase 2.3+
          per the build sequence in ARCHITECTURE.md §7.
        </p>
        <p className="font-sans text-xs text-muted/60 pt-8">
          dashboard.meirverse.app
        </p>
      </div>
    </main>
  );
}
