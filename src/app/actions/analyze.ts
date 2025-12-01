'use server';

import * as cheerio from 'cheerio';

export interface AnalysisResult {
    url: string;
    title: string;
    metaDescription: string;
    h1: string | null;
    responseTime: number;
    statusCode: number;
    error?: string;
}

export async function analyzeUrl(formData: FormData): Promise<AnalysisResult> {
    const url = formData.get('url') as string;

    if (!url) {
        return {
            url: '',
            title: '',
            metaDescription: '',
            h1: null,
            responseTime: 0,
            statusCode: 0,
            error: 'URL is required',
        };
    }

    // Ensure URL has protocol
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;

    const startTime = Date.now();
    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Website-Analyzer/1.0',
            },
            next: { revalidate: 0 } // Disable cache for real-time analysis
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;
        const statusCode = response.status;

        const html = await response.text();
        const $ = cheerio.load(html);

        const title = $('title').text().trim();
        const metaDescription = $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content') ||
            '';
        const h1 = $('h1').first().text().trim() || null;

        return {
            url: targetUrl,
            title,
            metaDescription,
            h1,
            responseTime,
            statusCode,
        };

    } catch (error) {
        return {
            url: targetUrl,
            title: '',
            metaDescription: '',
            h1: null,
            responseTime: 0,
            statusCode: 0,
            error: error instanceof Error ? error.message : 'Failed to analyze URL',
        };
    }
}
