'use client';
'use client';

import { useState } from 'react';
import ResultsDisplay from './ResultsDisplay';
import { PageAnalysis } from '../lib/crawler';

export default function AnalyzerForm() {
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<PageAnalysis[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [maxPages, setMaxPages] = useState(20);

    async function handleSubmit(formData: FormData) {
        setIsLoading(true);
        setResults([]);
        setError(null);

        const url = formData.get('url') as string;
        if (!url) return;

        try {
            const response = await fetch(`/api/analyze?url=${encodeURIComponent(url)}&maxPages=${maxPages}`);

            if (!response.ok) {
                throw new Error(await response.text());
            }

            if (!response.body) return;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let buffer = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                const lines = buffer.split('\n');
                // Keep the last potentially incomplete line in the buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const result = JSON.parse(line);
                        setResults(prev => [...prev, result]);
                    } catch (e) {
                        console.error('Failed to parse chunk', e);
                    }
                }
            }

            // Process any remaining buffer
            if (buffer.trim()) {
                try {
                    const result = JSON.parse(buffer);
                    setResults(prev => [...prev, result]);
                } catch (e) {
                    console.error('Failed to parse final chunk', e);
                }
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="w-full flex flex-col items-center">
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit(new FormData(e.currentTarget));
                }}
                className="w-full max-w-xl space-y-6"
            >
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1 group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-primary-dark rounded-lg blur opacity-30 group-hover:opacity-75 transition duration-200"></div>
                        <input
                            type="text"
                            name="url"
                            placeholder="Enter website URL (e.g., example.com)"
                            required
                            className="relative w-full px-4 py-4 rounded-lg bg-surface text-foreground placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-8 py-4 rounded-lg bg-primary hover:bg-primary-dark text-black font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-[0_0_20px_rgba(29,205,159,0.3)] hover:shadow-[0_0_30px_rgba(29,205,159,0.5)]"
                    >
                        {isLoading ? 'Analyzing...' : 'Analyze'}
                    </button>
                </div>

                <div className="flex items-center gap-4 px-1">
                    <label htmlFor="maxPages" className="text-sm font-medium text-text-muted whitespace-nowrap">
                        Max Pages: <span className="text-primary font-bold">{maxPages}</span>
                    </label>
                    <input
                        type="range"
                        id="maxPages"
                        min="1"
                        max="100"
                        value={maxPages}
                        onChange={(e) => setMaxPages(Number(e.target.value))}
                        disabled={isLoading}
                        className="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                </div>

                {isLoading && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex justify-between text-sm text-text-muted">
                            <span>Scanning...</span>
                            <span>{results.length} / {maxPages} pages</span>
                        </div>
                        <div className="h-2 w-full bg-surface rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary transition-all duration-300 ease-out shadow-[0_0_10px_rgba(29,205,159,0.5)]"
                                style={{ width: `${Math.min((results.length / maxPages) * 100, 100)}%` }}
                            />
                        </div>
                    </div>
                )}

                {error && (
                    <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/50 text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}
            </form>

            <ResultsDisplay results={results} />
        </div>
    );
}
