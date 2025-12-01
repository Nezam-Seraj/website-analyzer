import { crawlSite } from '@/lib/crawler';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const url = searchParams.get('url');
    const maxPagesParam = searchParams.get('maxPages');

    // Default to 20, clamp between 1 and 100
    const maxPages = Math.min(Math.max(parseInt(maxPagesParam || '20', 10), 1), 100);

    if (!url) {
        return new Response('URL is required', { status: 400 });
    }

    // Ensure URL is valid
    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
        targetUrl = `https://${targetUrl}`;
    }

    try {
        new URL(targetUrl);
    } catch (e) {
        return new Response('Invalid URL', { status: 400 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            try {
                const crawler = crawlSite(targetUrl, { maxPages, maxDepth: 2 });

                for await (const result of crawler) {
                    // Send each result as a JSON line
                    const data = JSON.stringify(result) + '\n';
                    controller.enqueue(encoder.encode(data));
                }

                controller.close();
            } catch (error) {
                controller.error(error);
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
