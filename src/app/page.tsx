import AnalyzerForm from "../components/AnalyzerForm";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <main className="flex flex-col items-center w-full max-w-3xl gap-12">
        <div className="text-center space-y-4">
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-foreground">
            Website <span className="text-primary">Analyzer</span>
          </h1>
          <p className="text-lg text-text-muted max-w-xl mx-auto">
            Enter a URL below to analyze its SEO metadata, response time, and server status.
          </p>
        </div>

        <AnalyzerForm />
      </main>
    </div>
  );
}
