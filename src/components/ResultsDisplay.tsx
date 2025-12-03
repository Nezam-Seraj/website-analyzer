import { PageAnalysis } from '../lib/crawler';

interface ResultsDisplayProps {
    results: PageAnalysis[];
}

export default function ResultsDisplay({ results }: ResultsDisplayProps) {
    if (results.length === 0) return null;

    const totalPages = results.length;
    const avgResponseTime = Math.round(
        results.reduce((acc, curr) => acc + curr.responseTime, 0) / totalPages
    );

    // Calculate total issues (HTTP + UX + Visual + Content)
    const totalIssues = results.reduce((acc, curr) => {
        let issues = 0;
        if (curr.statusCode >= 400 || curr.error) issues++;

        // UX
        if (curr.uxIssues) {
            if (curr.uxIssues.missingAltTags > 0) issues++;
            if (!curr.uxIssues.hasViewport) issues++;
            if (curr.uxIssues.h1Count === 0 || curr.uxIssues.h1Count > 1) issues++;
        }

        // Visual
        if (curr.visualIssues) {
            if (curr.visualIssues.imagesMissingDimensions > 0) issues++;
            if (curr.visualIssues.longWords > 0) issues++;
            if (curr.visualIssues.viewportIssues) {
                curr.visualIssues.viewportIssues.forEach(vp => {
                    if (vp.horizontalScroll) issues++;
                    if (vp.overflowingElements > 0) issues++;
                    if (vp.smallTapTargets && vp.smallTapTargets > 0) issues++;
                });
            }
        }

        // Content
        if (curr.contentIssues && curr.contentIssues.possibleTypos.length > 0) issues++;

        return acc + issues;
    }, 0);

    const downloadCSV = () => {
        const headers = [
            'URL',
            'Status',
            'Response Time (ms)',
            'Title',
            'Meta Description',
            'H1 Tag',
            'SEO Score',
            'AI Score',
            'Word Count',
            'Readability Score',
            'Structure Score',
            'Schema Detected',
            'Text-to-Code Ratio',
            'Paragraph Count',
            'Long Paragraphs',
            'Missing Alt Tags',
            'Empty Links',
            'Has Viewport',
            'H1 Count',
            'Images Missing Dimensions',
            'Long Words',
            'Horizontal Scroll',
            'Overflowing Elements',
            'Top Keywords',
            'Possible Typos',
            'Schema Types',
            'Question Headings',
            'Has Author',
            'Has Date',
            'Small Tap Targets'
        ];

        const rows = results.map(r => {
            const keywords = r.contentMetrics?.keywords.map(k => `${k.word} (${k.count})`).join('; ') || '';
            const typos = r.contentIssues?.possibleTypos.join('; ') || '';
            const hasHorizontalScroll = r.visualIssues?.viewportIssues?.some(vp => vp.horizontalScroll) ? 'Yes' : 'No';
            const overflowingElements = r.visualIssues?.viewportIssues?.reduce((acc, vp) => acc + vp.overflowingElements, 0) || 0;
            const smallTapTargets = r.visualIssues?.viewportIssues?.reduce((acc, vp) => acc + (vp.smallTapTargets || 0), 0) || 0;
            const schemaTypes = r.contentMetrics?.schemaTypes?.join(', ') || 'None';

            return [
                r.url,
                r.statusCode,
                r.responseTime,
                r.title || '',
                r.metaDescription || '',
                r.h1 || '',
                r.contentMetrics?.seoScore || 0,
                r.contentMetrics?.aiScore || 0,
                r.contentMetrics?.wordCount || 0,
                r.contentMetrics?.readabilityScore || 0,
                r.contentMetrics?.structureScore || 0,
                r.contentMetrics?.hasSchema ? 'Yes' : 'No',
                (r.contentMetrics?.contentQuality?.textToCodeRatio || 0).toFixed(2),
                r.contentMetrics?.paragraphCount || 0,
                r.contentMetrics?.contentQuality?.longParagraphs || 0,
                r.uxIssues?.missingAltTags || 0,
                r.uxIssues?.emptyLinks || 0,
                r.uxIssues?.hasViewport ? 'Yes' : 'No',
                r.uxIssues?.h1Count || 0,
                r.visualIssues?.imagesMissingDimensions || 0,
                r.visualIssues?.longWords || 0,
                hasHorizontalScroll,
                overflowingElements,
                keywords,
                typos,
                schemaTypes,
                r.contentMetrics?.questionHeadings || 0,
                r.contentMetrics?.eeatSignals?.hasAuthor ? 'Yes' : 'No',
                r.contentMetrics?.eeatSignals?.hasDate ? 'Yes' : 'No',
                smallTapTargets
            ];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `website-analysis-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="w-full max-w-4xl mt-12 space-y-8">
            <div className="flex justify-end">
                <button
                    onClick={downloadCSV}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-primary/20 text-primary hover:bg-primary/10 transition-colors text-sm font-bold"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download CSV
                </button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-6 bg-surface rounded-xl border border-white/5 shadow-lg">
                    <span className="text-sm font-medium text-text-muted">Pages Scanned</span>
                    <p className="text-3xl font-bold text-foreground mt-2">{totalPages}</p>
                </div>
                <div className="p-6 bg-surface rounded-xl border border-white/5 shadow-lg">
                    <span className="text-sm font-medium text-text-muted">Avg Response Time</span>
                    <p className="text-3xl font-bold text-foreground mt-2">{avgResponseTime}ms</p>
                </div>
                <div className="p-6 bg-surface rounded-xl border border-white/5 shadow-lg">
                    <span className="text-sm font-medium text-text-muted">Issues Found</span>
                    <p className={`text-3xl font-bold mt-2 ${totalIssues > 0 ? 'text-amber-500' : 'text-primary'}`}>
                        {totalIssues}
                    </p>
                </div>
            </div>

            {/* Detailed List */}
            <div className="bg-surface rounded-xl border border-white/5 shadow-lg overflow-hidden">
                <div className="px-6 py-5 border-b border-white/5">
                    <h2 className="text-xl font-bold text-foreground">Detailed Results</h2>
                </div>
                <div className="divide-y divide-white/5">
                    {results.map((result, index) => {
                        const uxIssues = result.uxIssues || { missingAltTags: 0, emptyLinks: 0, hasViewport: false, h1Count: 0 };
                        const visualIssues = result.visualIssues || { imagesMissingDimensions: 0, longWords: 0, viewportIssues: [] };
                        const contentIssues = result.contentIssues || { possibleTypos: [] };

                        const hasUxIssues = uxIssues.missingAltTags > 0 || !uxIssues.hasViewport || uxIssues.h1Count !== 1;
                        const hasViewportIssues = visualIssues.viewportIssues?.some(vp => vp.horizontalScroll || vp.overflowingElements > 0 || (vp.smallTapTargets || 0) > 0);
                        const hasVisualIssues = visualIssues.imagesMissingDimensions > 0 || visualIssues.longWords > 0 || hasViewportIssues;
                        const hasContentIssues = contentIssues.possibleTypos.length > 0;

                        return (
                            <div key={index} className="p-6 hover:bg-white/[0.02] transition-colors">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                    <div className="space-y-1 flex-1 min-w-0">
                                        <div className="flex items-center gap-3">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold ${result.statusCode >= 200 && result.statusCode < 300
                                                ? 'bg-primary/10 text-primary border border-primary/20'
                                                : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                                }`}>
                                                {result.statusCode}
                                            </span>
                                            <h3 className="text-base font-semibold text-foreground truncate" title={result.url}>
                                                {result.url}
                                            </h3>
                                        </div>
                                        <p className="text-sm text-text-muted truncate">
                                            {result.title || <span className="italic opacity-50">No title</span>}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm text-text-muted whitespace-nowrap font-mono">
                                        <span>{result.responseTime}ms</span>
                                    </div>
                                </div>

                                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
                                    {/* UX & Accessibility */}
                                    <div>
                                        <span className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">UX & Accessibility</span>
                                        {hasUxIssues ? (
                                            <ul className="space-y-1.5 text-amber-500">
                                                {uxIssues.missingAltTags > 0 && <li>• {uxIssues.missingAltTags} images missing alt tags</li>}
                                                {!uxIssues.hasViewport && <li>• Missing viewport meta tag</li>}
                                                {uxIssues.h1Count !== 1 && <li>• Found {uxIssues.h1Count} H1 tags</li>}
                                            </ul>
                                        ) : (
                                            <p className="text-primary flex items-center gap-1.5">
                                                <span className="text-lg">✓</span> Good
                                            </p>
                                        )}
                                    </div>

                                    {/* Visual Stability */}
                                    <div>
                                        <span className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Visual Stability</span>
                                        {hasVisualIssues ? (
                                            <div className="space-y-2">
                                                <ul className="space-y-1.5 text-amber-500">
                                                    {visualIssues.imagesMissingDimensions > 0 && <li>• {visualIssues.imagesMissingDimensions} images missing size</li>}
                                                    {visualIssues.longWords > 0 && <li>• {visualIssues.longWords} very long words</li>}
                                                </ul>
                                                {/* Viewport Specific Issues */}
                                                {visualIssues.viewportIssues && visualIssues.viewportIssues.length > 0 && (
                                                    <div className="mt-2 space-y-2">
                                                        {visualIssues.viewportIssues.map((vp, i) => {
                                                            if (!vp.horizontalScroll && vp.overflowingElements === 0 && (!vp.smallTapTargets || vp.smallTapTargets === 0)) return null;
                                                            return (
                                                                <div key={i} className="text-xs bg-amber-500/10 border border-amber-500/20 p-2 rounded">
                                                                    <span className="font-semibold block text-amber-500">{vp.viewport} Issues:</span>
                                                                    <ul className="ml-2 mt-1 space-y-0.5 text-amber-400">
                                                                        {vp.horizontalScroll && <li>• Horizontal scroll detected</li>}
                                                                        {vp.overflowingElements > 0 && <li>• {vp.overflowingElements} elements overflowing</li>}
                                                                        {vp.smallTapTargets && vp.smallTapTargets > 0 && <li>• {vp.smallTapTargets} small tap targets</li>}
                                                                    </ul>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-primary flex items-center gap-1.5">
                                                <span className="text-lg">✓</span> Good
                                            </p>
                                        )}
                                    </div>

                                    {/* Content & Typos */}
                                    <div>
                                        <span className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Content Check</span>
                                        {hasContentIssues ? (
                                            <div>
                                                <p className="text-amber-500 mb-1.5">Possible Typos:</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {contentIssues.possibleTypos.map((typo, i) => (
                                                        <span key={i} className="px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded text-xs">
                                                            {typo}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-primary flex items-center gap-1.5">
                                                <span className="text-lg">✓</span> No typos found
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Content Intelligence */}
                                {result.contentMetrics && (
                                    <div className="mt-6 pt-6 border-t border-white/5">
                                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-4">Content Intelligence</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                            {/* SEO Score */}
                                            <div>
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-sm font-medium text-foreground">SEO Score</span>
                                                    <span className={`text-sm font-bold ${result.contentMetrics.seoScore >= 80 ? 'text-primary' : result.contentMetrics.seoScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                                        {result.contentMetrics.seoScore}/100
                                                    </span>
                                                </div>
                                                <div className="h-2 bg-black rounded-full overflow-hidden border border-white/5">
                                                    <div
                                                        className={`h-full rounded-full ${result.contentMetrics.seoScore >= 80 ? 'bg-primary' : result.contentMetrics.seoScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                        style={{ width: `${result.contentMetrics.seoScore}%` }}
                                                    />
                                                </div>
                                                <div className="mt-3 text-xs text-text-muted space-y-1.5">
                                                    <p>• {result.contentMetrics.wordCount} words</p>
                                                    <p className={result.contentMetrics.hasSchema ? 'text-primary' : 'text-amber-500'}>
                                                        {result.contentMetrics.hasSchema ? '✓ Schema detected' : '⚠ No Schema detected'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* AI Score */}
                                            <div>
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-sm font-medium text-foreground">AI Optimization (GEO)</span>
                                                    <div className="text-right">
                                                        <span className={`text-sm font-bold ${result.contentMetrics.aiScore >= 80 ? 'text-primary' : result.contentMetrics.aiScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                                            {result.contentMetrics.aiScore}/100
                                                        </span>
                                                        <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded ${result.contentMetrics.aiScore >= 80
                                                            ? 'bg-primary/10 text-primary border border-primary/20'
                                                            : result.contentMetrics.aiScore >= 50
                                                                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                                                : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                                            }`}>
                                                            {result.contentMetrics.aiScore >= 80 ? 'Good' : result.contentMetrics.aiScore >= 50 ? 'Needs Improvement' : 'Fail'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="h-2 bg-black rounded-full overflow-hidden mb-4 border border-white/5">
                                                    <div
                                                        className={`h-full rounded-full ${result.contentMetrics.aiScore >= 80 ? 'bg-primary' : result.contentMetrics.aiScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                        style={{ width: `${result.contentMetrics.aiScore}%` }}
                                                    />
                                                </div>

                                                {/* Actionable Advice */}
                                                <div className="bg-black/40 rounded-lg p-4 border border-white/5 space-y-3">
                                                    <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Optimization Tips</p>

                                                    {result.contentMetrics.aiScore === 100 ? (
                                                        <p className="text-xs text-primary">✓ Excellent! Your content is perfectly optimized for AI engines.</p>
                                                    ) : (
                                                        <ul className="space-y-2.5">
                                                            {/* Schema Checks */}
                                                            {!result.contentMetrics.hasSchema ? (
                                                                <li className="text-xs flex gap-2.5 text-text-muted">
                                                                    <span className="text-red-500 font-bold text-base leading-none">!</span>
                                                                    <span>
                                                                        <strong className="block text-foreground mb-0.5">Missing Structured Data</strong>
                                                                        Add JSON-LD Schema (e.g., Article, Product, FAQPage) to help AI understand your content.
                                                                    </span>
                                                                </li>
                                                            ) : (
                                                                <li className="text-xs flex gap-2.5 text-text-muted">
                                                                    <span className="text-primary font-bold text-base leading-none">✓</span>
                                                                    <span>
                                                                        <strong className="block text-foreground mb-0.5">Schema Detected</strong>
                                                                        Found: <span className="text-primary/80 font-mono">{result.contentMetrics.schemaTypes?.join(', ') || 'Generic'}</span>
                                                                    </span>
                                                                </li>
                                                            )}

                                                            {/* Question Headings */}
                                                            {(result.contentMetrics.questionHeadings || 0) === 0 && (
                                                                <li className="text-xs flex gap-2.5 text-text-muted">
                                                                    <span className="text-amber-500 font-bold text-base leading-none">!</span>
                                                                    <span>
                                                                        <strong className="block text-foreground mb-0.5">Add Q&A Content</strong>
                                                                        Use headings phrased as questions (Who, What, How). AI engines favor direct answers to questions.
                                                                    </span>
                                                                </li>
                                                            )}

                                                            {/* E-E-A-T Signals */}
                                                            {(!result.contentMetrics.eeatSignals?.hasAuthor || !result.contentMetrics.eeatSignals?.hasDate) && (
                                                                <li className="text-xs flex gap-2.5 text-text-muted">
                                                                    <span className="text-amber-500 font-bold text-base leading-none">!</span>
                                                                    <span>
                                                                        <strong className="block text-foreground mb-0.5">Boost Credibility (E-E-A-T)</strong>
                                                                        {(!result.contentMetrics.eeatSignals?.hasAuthor && !result.contentMetrics.eeatSignals?.hasDate)
                                                                            ? "Missing Author and Date. "
                                                                            : !result.contentMetrics.eeatSignals?.hasAuthor
                                                                                ? "Missing Author. "
                                                                                : "Missing Date. "
                                                                        }
                                                                        Explicitly state who wrote this and when.
                                                                    </span>
                                                                </li>
                                                            )}

                                                            {/* Readability */}
                                                            {result.contentMetrics.readabilityScore < 60 && (
                                                                <li className="text-xs flex gap-2.5 text-text-muted">
                                                                    <span className="text-amber-500 font-bold text-base leading-none">!</span>
                                                                    <span>
                                                                        <strong className="block text-foreground mb-0.5">Simplify Content</strong>
                                                                        Readability is low ({result.contentMetrics.readabilityScore}/100). Use shorter sentences and simpler words.
                                                                    </span>
                                                                </li>
                                                            )}
                                                        </ul>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
