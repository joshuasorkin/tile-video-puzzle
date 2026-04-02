import { RANDOM_VIDEO_SEARCH_TERMS } from './constants.js';

const VIDEO_EXTENSION_PATTERN = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i;
const WIKIMEDIA_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';

function randomItem(items, random = Math.random) {
    return items[Math.floor(random() * items.length)];
}

export function validateVideoUrl(rawUrl) {
    const url = rawUrl.trim();
    if (!url) {
        return { ok: true, url: '' };
    }

    if (url.startsWith('blob:') || VIDEO_EXTENSION_PATTERN.test(url) || url.includes('googleusercontent')) {
        return { ok: true, url };
    }

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return {
            message: 'YouTube links are not supported due to browser security (CORS). Please use a direct .mp4 link.',
            ok: false
        };
    }

    if (url.includes('wikimedia.org/wiki/File:')) {
        return {
            message: "That's a link to a web page. Right-click the video and select 'Copy video address' for the direct .webm link.",
            ok: false
        };
    }

    return {
        message: "This doesn't look like a direct video file. Ensure the URL ends in .mp4, .webm, or .ogg.",
        ok: false
    };
}

function buildRandomVideoSearchUrl(term, offset) {
    const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        generator: 'search',
        gsrnamespace: '6',
        gsrlimit: '50',
        gsroffset: String(offset),
        gsrsearch: term,
        iiprop: 'url|mime',
        origin: '*',
        prop: 'imageinfo'
    });

    return `${WIKIMEDIA_ENDPOINT}?${params.toString()}`;
}

function extractVideoUrls(data) {
    if (!data.query?.pages) {
        return [];
    }

    return Object.values(data.query.pages)
        .filter((page) => page.imageinfo?.[0]?.mime?.startsWith('video/'))
        .map((page) => page.imageinfo[0].url);
}

export async function fetchRandomVideoUrl({
    fetchImpl = fetch,
    maxAttempts = 6,
    random = Math.random,
    searchTerms = RANDOM_VIDEO_SEARCH_TERMS
} = {}) {
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const term = randomItem(searchTerms, random);
            const offset = Math.floor(random() * 100);
            const response = await fetchImpl(buildRandomVideoSearchUrl(term, offset));
            const data = await response.json();
            const videos = extractVideoUrls(data);

            if (videos.length > 0) {
                return randomItem(videos, random);
            }
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError) {
        throw lastError;
    }

    throw new Error('Could not find any movie previews after several attempts. Please try again.');
}
