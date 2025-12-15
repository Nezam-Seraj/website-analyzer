import fs from 'fs';
import path from 'path';
import puppeteer, { Browser, Page } from 'puppeteer';
import nspell from 'nspell';

// Initialize spell checker
let spell: nspell | undefined;

try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dictionary = require('dictionary-en');

    dictionary((err: Error, dict: unknown) => {
        if (!err && dict) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            spell = nspell(dict as any);
        }
    });
} catch (e) {
    console.warn('Failed to load dictionary-en:', e);
}

export interface ViewportIssue {
    viewport: 'Desktop' | 'Tablet' | 'Mobile';
    horizontalScroll: boolean;
    overflowingElements: number;
    smallTapTargets?: number;
    offendingElements?: string[];
    screenshotPath?: string;
}

export interface PageAnalysis {
    url: string;
    title: string;
    metaDescription: string;
    h1: string | null;
    responseTime: number;
    statusCode: number;
    error?: string;
    links: string[];
    uxIssues: {
        missingAltTags: number;
        emptyLinks: number;
        hasViewport: boolean;
        h1Count: number;
    };
    visualIssues: {
        imagesMissingDimensions: number;
        longWords: number;
        viewportIssues: ViewportIssue[];
    };
    contentIssues: {
        possibleTypos: string[];
    };
    contentMetrics?: {
        wordCount: number;
        readabilityScore: number;
        structureScore: number;
        hasSchema: boolean;
        seoScore: number;

        aiScore: number;
        headings: { tag: string; text: string }[];
        keywords: { word: string; count: number }[];
        paragraphCount: number;
        schemaTypes: string[];
        questionHeadings: number;
        eeatSignals: {
            hasAuthor: boolean;
            hasDate: boolean;
        };
        contentQuality: {
            longParagraphs: number;
            textToCodeRatio: number;
        };
    };
}

export interface CrawlOptions {
    maxPages: number;
    maxDepth: number;
}

async function analyzePage(page: Page, url: string): Promise<PageAnalysis> {
    const startTime = Date.now();
    try {
        // Initial load (Desktop default)
        await page.setViewport({ width: 1920, height: 1080 });

        let response;
        try {
            response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {
            // If timeout, we still try to analyze what loaded
            if (e instanceof Error && e.name === 'TimeoutError') {
                console.warn(`Timeout loading ${url}, attempting partial analysis`);
            } else {
                throw e;
            }
        }

        const endTime = Date.now();
        const responseTime = endTime - startTime;
        const statusCode = response ? response.status() : 0; // 0 indicates timeout/partial

        if (response && !response.ok()) {
            return {
                url,
                title: '',
                metaDescription: '',
                h1: null,
                responseTime,
                statusCode,
                error: `HTTP ${statusCode}`,
                links: [],
                uxIssues: { missingAltTags: 0, emptyLinks: 0, hasViewport: false, h1Count: 0 },
                visualIssues: { imagesMissingDimensions: 0, longWords: 0, viewportIssues: [] },
                contentIssues: { possibleTypos: [] },
            };
        }

        // 1. Static Analysis (Metadata, Content, UX) - Run once
        const staticAnalysis = await page.evaluate(() => {
            const title = document.title;
            const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') ||
                document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
            const h1 = document.querySelector('h1')?.textContent?.trim() || null;

            // UX Checks
            const missingAltTags = Array.from(document.images).filter(img => !img.hasAttribute('alt')).length;
            const emptyLinks = Array.from(document.links).filter(a => !a.innerText.trim() && !a.querySelector('img')).length;
            const hasViewport = !!document.querySelector('meta[name="viewport"]');
            const h1Count = document.querySelectorAll('h1').length;

            // Visual Checks (Computed - Global)
            const imagesMissingDimensions = Array.from(document.images).filter(img => {
                return img.naturalWidth > 0 && (!img.hasAttribute('width') && !img.hasAttribute('height'));
            }).length;

            // Extract text for content analysis
            const textContent = document.body.innerText;

            // Links
            const links = Array.from(document.links).map(a => a.href);

            return {
                title,
                metaDesc,
                h1,
                missingAltTags,
                emptyLinks,
                hasViewport,
                h1Count,
                imagesMissingDimensions,
                textContent,
                links,
                hasSchema: !!document.querySelector('script[type="application/ld+json"]'),
                structureCount: document.querySelectorAll('ul, ol, table, dl, article, section, nav').length,
                paragraphCount: document.querySelectorAll('p').length,
                headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
                    tag: h.tagName,
                    text: h.textContent?.trim() || ''
                })),
                longParagraphs: Array.from(document.querySelectorAll('p')).filter(p => (p.textContent?.split(/\s+/).length || 0) > 150).length,
                htmlSize: document.documentElement.outerHTML.length,
                schemaTypes: Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
                    .map(script => {
                        try {
                            const json = JSON.parse(script.textContent || '{}');
                            return json['@type'] || '';
                        } catch {
                            return '';
                        }
                    })
                    .flat()
                    .filter(Boolean),
                hasAuthor: !!document.querySelector('meta[name="author"]') ||
                    !!document.querySelector('meta[property="article:author"]') ||
                    /by\s+[A-Z][a-z]+/i.test(document.body.innerText.substring(0, 2000)), // Simple heuristic for "By [Name]"
                hasDate: !!document.querySelector('meta[name="date"]') ||
                    !!document.querySelector('meta[property="article:published_time"]') ||
                    !!document.querySelector('time')
            };
        });

        // 2. Multi-Viewport Analysis
        const viewports = [
            { name: 'Desktop', width: 1920, height: 1080 },
            { name: 'Tablet', width: 768, height: 1024 },
            { name: 'Mobile', width: 375, height: 667 }
        ] as const;

        const viewportIssues: ViewportIssue[] = [];

        for (const vp of viewports) {
            await page.setViewport({ width: vp.width, height: vp.height });
            // Give a small buffer for layout to settle
            await new Promise(r => setTimeout(r, 500));

            const issues = await page.evaluate(() => {
                const width = window.innerWidth;
                // Check 1: Horizontal Scroll
                // Increased buffer to 10px to avoid false positives from sub-pixel rendering and scrollbars
                // Also check if scrollWidth is actually significantly larger than clientWidth
                const docElement = document.documentElement;
                const hasHorizontalScroll = (docElement.scrollWidth > width + 10) &&
                    (docElement.scrollWidth > docElement.clientWidth + 10);

                // Check 2: Overflowing Elements
                const offendingElements: string[] = [];

                // Helper to get element identifier
                const getIdentifier = (el: Element) => {
                    let id = el.tagName.toLowerCase();
                    if (el.id) id += `#${el.id}`;
                    if (el.className && typeof el.className === 'string') id += `.${el.className.split(' ').join('.')}`;
                    return id.substring(0, 50); // Truncate if too long
                };

                // Helper to check if element is visible
                const isVisible = (el: Element, style: CSSStyleDeclaration) => {
                    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                };

                // Buttons/Inputs with text overflow
                document.querySelectorAll('button, input[type="submit"], a[class*="btn"], a[class*="button"]').forEach(el => {
                    if (el.scrollWidth > el.clientWidth + 2) { // Small buffer
                        const style = window.getComputedStyle(el);
                        if (isVisible(el, style)) {
                            offendingElements.push(getIdentifier(el));
                        }
                    }
                });

                // Images wider than viewport
                document.querySelectorAll('img').forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    // Check if image sticks out of the viewport significantly
                    if (rect.right > width + 5 && rect.left < width && isVisible(el, style)) {
                        offendingElements.push(getIdentifier(el));
                    }
                });

                // General elements that are just too wide (careful with this one)
                // Only checking direct children of body or major wrappers to avoid noise
                document.body.querySelectorAll('div, section, article, main, header, footer').forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);

                    // Filter out intentionally hidden stuff or full-width containers that match expectations
                    if (rect.width > width + 10 && rect.left < 5 && isVisible(el, style)) {

                        // Check if parent hides overflow
                        const parent = el.parentElement;
                        let parentHidesOverflow = false;
                        if (parent) {
                            const parentStyle = window.getComputedStyle(parent);
                            if (parentStyle.overflowX === 'hidden' || parentStyle.overflow === 'hidden') {
                                parentHidesOverflow = true;
                            }
                        }

                        if (!parentHidesOverflow) {
                            // Only report if it's SIGNIFICANTLY wider (more than scrollbar width usually)
                            if (rect.width > width + 20) {
                                offendingElements.push(getIdentifier(el));
                            }
                        }
                    }
                });

                const unique = Array.from(new Set(offendingElements)).slice(0, 5);

                // Check 3: Small Tap Targets (Mobile Friendly)
                let smallTapTargets = 0;
                if (width < 768) { // Only check on mobile/tablet
                    document.querySelectorAll('button, a, input[type="submit"]').forEach(el => {
                        const rect = el.getBoundingClientRect();
                        // Ignore hidden elements
                        if (rect.width === 0 || rect.height === 0) return;

                        // Google recommends 48x48, but 44x44 is also common standard
                        if (rect.width < 44 || rect.height < 44) {
                            // Check if it's just a text link (inline) vs a button
                            const style = window.getComputedStyle(el);

                            // More robust inline check: if it wraps or is just text, it might be fine if it has padding
                            // But strictly, 44x44 applies to the clickable area.
                            // We heavily discount "inline" text links which often fail this but are acceptable in context
                            if (style.display === 'inline' || (style.display === 'inline-block' && style.padding === '0px')) {
                                // Skip pure text links for now to reduce noise
                                return;
                            }

                            // If it looks like a button (bg color, border), it MUST be 44x44
                            if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.borderWidth !== '0px') {
                                smallTapTargets++;
                            }
                        }
                    });
                }

                return { horizontalScroll: hasHorizontalScroll, overflowingElements: unique.length, smallTapTargets, offendingElements: unique };
            });

            // Capture screenshot if there are visual issues
            let screenshotPath: string | undefined;
            if (issues.horizontalScroll || issues.overflowingElements > 0) {
                const timestamp = Date.now();
                const safeUrl = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
                const filename = `issue_${safeUrl}_${vp.name}_${timestamp}.jpg`;
                const publicDir = path.join(process.cwd(), 'public', 'screenshots');
                const filepath = path.join(publicDir, filename);

                // Ensure dir exists
                try {
                    if (!fs.existsSync(publicDir)) {
                        fs.mkdirSync(publicDir, { recursive: true });
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (page as any).screenshot({ path: filepath, type: 'jpeg', quality: 60, fullPage: false });
                    screenshotPath = `/screenshots/${filename}`;
                } catch (err) {
                    console.error('Failed to save screenshot', err);
                }
            }

            viewportIssues.push({
                viewport: vp.name,
                horizontalScroll: issues.horizontalScroll,
                overflowingElements: issues.overflowingElements,
                smallTapTargets: issues.smallTapTargets,
                offendingElements: issues.offendingElements,
                screenshotPath
            });
        }

        // Post-process content analysis (Node.js side)
        const possibleTypos = new Set<string>();
        let longWords = 0;

        const words = staticAnalysis.textContent.split(/\s+/);
        for (const word of words) {
            const cleanWord = word.replace(/[^\w'-]/g, '');
            if (!cleanWord) continue;

            if (cleanWord.length > 20) {
                longWords++;
            }

            if (spell && /^[a-zA-Z]+$/.test(cleanWord) && cleanWord.length > 3) {
                if (!spell.correct(cleanWord)) {
                    possibleTypos.add(cleanWord);
                }
            }
        }

        // Calculate Content Metrics & Scores
        const wordCount = words.length;
        const sentenceCount = staticAnalysis.textContent.split(/[.!?]+/).length || 1;

        // Syllable heuristic
        let syllableCount = 0;
        for (const word of words) {
            const clean = word.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, '');
            syllableCount += (clean.match(/[aeiouy]+/g) || []).length || 1;
        }

        // Flesch-Kincaid Reading Ease
        // 206.835 - 1.015 * (total words / total sentences) - 84.6 * (total syllables / total words)
        const avgSentenceLength = wordCount / sentenceCount;
        const avgSyllablesPerWord = syllableCount / wordCount || 1;
        const readabilityScore = Math.min(100, Math.max(0, Math.round(
            206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord)
        )));

        // Structure Score (0-100)
        // Base 50, +10 for each structure element type found (up to 50)
        const structureScore = Math.min(100, 50 + (staticAnalysis.structureCount * 5));

        // SEO Score (0-100)
        let seoScore = 0;
        if (staticAnalysis.title && staticAnalysis.title.length >= 10 && staticAnalysis.title.length <= 60) seoScore += 20;
        else if (staticAnalysis.title) seoScore += 10;

        if (staticAnalysis.metaDesc && staticAnalysis.metaDesc.length >= 50 && staticAnalysis.metaDesc.length <= 160) seoScore += 20;
        else if (staticAnalysis.metaDesc) seoScore += 10;

        if (staticAnalysis.h1) seoScore += 20;
        if (staticAnalysis.missingAltTags === 0) seoScore += 20;
        if (wordCount > 300) seoScore += 20;

        // AI Optimization Score (0-100)
        // Focuses on clarity, structure, and machine-readable data
        let aiScore = 0;

        // 1. Schema Quality (Max 40)
        if (staticAnalysis.hasSchema) {
            aiScore += 10; // Base points for having any schema
            const valuableSchemas = ['Article', 'Product', 'FAQPage', 'Organization', 'BreadcrumbList', 'Recipe', 'Review'];
            const foundValuable = staticAnalysis.schemaTypes.some((t: string) => valuableSchemas.includes(t));
            if (foundValuable) aiScore += 30;
            else aiScore += 10;
        }

        // 2. Structure & Readability (Max 30)
        if (structureScore > 70) aiScore += 15;
        if (readabilityScore > 60) aiScore += 15;

        // 3. Question Headings (Max 15) - GEO Strategy
        const questionWords = ['who', 'what', 'where', 'when', 'why', 'how', 'can', 'does', 'is', 'are'];
        const questionHeadings = staticAnalysis.headings.filter(h => {
            const text = h.text.toLowerCase();
            return questionWords.some(w => text.startsWith(w)) || text.endsWith('?');
        }).length;
        if (questionHeadings > 0) aiScore += 15;

        // 4. E-E-A-T Signals (Max 15)
        if (staticAnalysis.hasAuthor) aiScore += 10;
        if (staticAnalysis.hasDate) aiScore += 5;

        // Cap at 100
        aiScore = Math.min(100, aiScore);

        // Keyword Extraction
        const stopWords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'is', 'are', 'was', 'were']);
        const wordFreq: Record<string, number> = {};
        for (const word of words) {
            const clean = word.toLowerCase().replace(/[^a-z]/g, '');
            if (clean.length > 3 && !stopWords.has(clean)) {
                wordFreq[clean] = (wordFreq[clean] || 0) + 1;
            }
        }
        const keywords = Object.entries(wordFreq)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([word, count]) => ({ word, count }));

        // Check if keywords appear in headings (Bonus SEO)
        const keywordsInHeadings = keywords.filter(k =>
            staticAnalysis.headings.some(h => h.text.toLowerCase().includes(k.word))
        ).length;
        if (keywordsInHeadings > 0) seoScore = Math.min(100, seoScore + 10);

        // Heading Hierarchy Check
        let previousLevel = 0;
        let hierarchyIssues = 0;
        for (const h of staticAnalysis.headings) {
            const level = parseInt(h.tag.substring(1));
            if (level > previousLevel + 1) hierarchyIssues++;
            previousLevel = level;
        }
        if (hierarchyIssues === 0 && staticAnalysis.headings.length > 0) seoScore = Math.min(100, seoScore + 10);

        // Text to Code Ratio
        const textToCodeRatio = staticAnalysis.htmlSize > 0 ? (staticAnalysis.textContent.length / staticAnalysis.htmlSize) : 0;

        return {
            url,
            title: staticAnalysis.title,
            metaDescription: staticAnalysis.metaDesc,
            h1: staticAnalysis.h1,
            responseTime,
            statusCode,
            links: staticAnalysis.links,
            uxIssues: {
                missingAltTags: staticAnalysis.missingAltTags,
                emptyLinks: staticAnalysis.emptyLinks,
                hasViewport: staticAnalysis.hasViewport,
                h1Count: staticAnalysis.h1Count,
            },
            visualIssues: {
                imagesMissingDimensions: staticAnalysis.imagesMissingDimensions,
                longWords,
                viewportIssues,
            },
            contentIssues: {
                possibleTypos: Array.from(possibleTypos).slice(0, 5),
            },
            contentMetrics: {
                wordCount,
                readabilityScore,
                structureScore,
                hasSchema: staticAnalysis.hasSchema,
                seoScore,
                aiScore,
                headings: staticAnalysis.headings,
                keywords,
                paragraphCount: staticAnalysis.paragraphCount,
                schemaTypes: staticAnalysis.schemaTypes,
                questionHeadings,
                eeatSignals: {
                    hasAuthor: staticAnalysis.hasAuthor,
                    hasDate: staticAnalysis.hasDate
                },
                contentQuality: {
                    longParagraphs: staticAnalysis.longParagraphs,
                    textToCodeRatio
                }
            }
        };

    } catch (error) {
        return {
            url,
            title: '',
            metaDescription: '',
            h1: null,
            responseTime: 0,
            statusCode: 0,
            error: error instanceof Error ? error.message : 'Failed to fetch',
            links: [],
            uxIssues: { missingAltTags: 0, emptyLinks: 0, hasViewport: false, h1Count: 0 },
            visualIssues: { imagesMissingDimensions: 0, longWords: 0, viewportIssues: [] },
            contentIssues: { possibleTypos: [] },
        };
    }
}

export async function* crawlSite(startUrl: string, options: CrawlOptions = { maxPages: 20, maxDepth: 2 }): AsyncGenerator<PageAnalysis> {
    const visited = new Set<string>();
    const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];
    let pagesCrawled = 0;

    // Launch browser
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        // Normalize start URL
        const startUrlObj = new URL(startUrl);
        const allowedDomain = startUrlObj.hostname;

        while (queue.length > 0 && pagesCrawled < options.maxPages) {
            const { url, depth } = queue.shift()!;

            if (visited.has(url)) continue;
            visited.add(url);

            const page = await browser.newPage();
            // Block images/css/fonts to speed up
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                // We MUST load stylesheets and fonts for accurate visual analysis (layout shifts, correct sizing)
                // We still block images/media to save some bandwidth, but we might need images for total accuracy later.
                // For now, blocking images is a trade-off.
                if (['image', 'media'].includes(resourceType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            const analysis = await analyzePage(page, url);
            await page.close();

            pagesCrawled++;
            yield analysis;

            if (depth < options.maxDepth) {
                for (const link of analysis.links) {
                    try {
                        const absoluteUrl = new URL(link, url).toString();
                        const urlObj = new URL(absoluteUrl);

                        if (urlObj.hostname === allowedDomain && (urlObj.protocol === 'http:' || urlObj.protocol === 'https:')) {
                            const cleanUrl = absoluteUrl.split('#')[0];
                            if (!visited.has(cleanUrl)) {
                                queue.push({ url: cleanUrl, depth: depth + 1 });
                            }
                        }
                    } catch (e) {
                        // Ignore invalid URLs
                    }
                }
            }
        }
    } finally {
        await browser.close();
    }
}
