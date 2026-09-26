require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 7000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

const cache = new Map();
const CACHE_TTL = 3600000;

function getCached(key) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, ts: Date.now() });
}

async function tmdbGet(path) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${TMDB_BASE}${path}${sep}api_key=${TMDB_API_KEY}&language=en-US`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    return res.json();
}

async function fetchCollection(id) {
    const data = await tmdbGet(`/collection/${id}`);
    return data.parts || [];
}

async function fetchAllPages(path) {
    let all = [];
    let page = 1;
    let totalPages = 1;
    do {
        const sep = path.includes("?") ? "&" : "?";
        const data = await tmdbGet(`${path}${sep}page=${page}`);
        all = all.concat(data.results || []);
        totalPages = data.total_pages || 1;
        page++;
    } while (page <= totalPages && page <= 10);
    return all;
}

function dedupe(arr) {
    const seen = new Set();
    return arr.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
    });
}

function fmtMovie(m) {
    return {
        id: `tmdb:${m.id}`,
        type: "movie",
        name: m.title,
        poster: m.poster_path ? `${IMG}/w500${m.poster_path}` : null,
        background: m.backdrop_path ? `${IMG}/w1280${m.backdrop_path}` : null,
        description: m.overview || "",
        year: m.release_date ? m.release_date.split("-")[0] : undefined
    };
}

function fmtSeries(s) {
    return {
        id: `tmdb:${s.id}`,
        type: "series",
        name: s.name,
        poster: s.poster_path ? `${IMG}/w500${s.poster_path}` : null,
        background: s.backdrop_path ? `${IMG}/w1280${s.backdrop_path}` : null,
        description: s.overview || "",
        year: s.first_air_date ? s.first_air_date.split("-")[0] : undefined
    };
}

function sortMovies(arr) {
    return arr.filter(m => m.release_date).sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
}

function sortSeries(arr) {
    return arr.filter(s => s.first_air_date).sort((a, b) => new Date(a.first_air_date) - new Date(b.first_air_date));
}

const AVENGERS_COLLECTION = 86311;
const XMEN_COLLECTIONS = [748, 453993, 448150];
const OTHER_COLLECTIONS = [558216, 556, 125574, 573436, 735, 9744, 90306, 635362, 728947];
const STANDALONE_MARVEL_IDS = [526896, 634492, 539972, 9947, 9480, 1927, 36647, 1250, 340102];
const MARVEL_STUDIOS = 420;
const MARVEL_ENTERTAINMENT = 7505;

const catalogFetchers = {
    avengers: async () => {
        const cached = getCached("avengers");
        if (cached) return cached;
        try {
            const movies = await fetchCollection(AVENGERS_COLLECTION);
            const result = sortMovies(movies).map(fmtMovie);
            setCache("avengers", result);
            return result;
        } catch (e) {
            console.error("Avengers error:", e.message);
            return [];
        }
    },

    xmen: async () => {
        const cached = getCached("xmen");
        if (cached) return cached;
        try {
            let all = [];
            for (const id of XMEN_COLLECTIONS) {
                try {
                    all = all.concat(await fetchCollection(id));
                } catch (e) {}
            }
            const result = sortMovies(dedupe(all)).map(fmtMovie);
            setCache("xmen", result);
            return result;
        } catch (e) {
            console.error("X-Men error:", e.message);
            return [];
        }
    },

    mcu_standalone: async () => {
        const cached = getCached("mcu_standalone");
        if (cached) return cached;
        try {
            const allMCU = await fetchAllPages(`/discover/movie?with_companies=${MARVEL_STUDIOS}&sort_by=release_date.asc`);
            const avengers = await fetchCollection(AVENGERS_COLLECTION);
            const excludeIds = new Set(avengers.map(m => m.id));
            const result = sortMovies(allMCU.filter(m => !excludeIds.has(m.id))).map(fmtMovie);
            setCache("mcu_standalone", result);
            return result;
        } catch (e) {
            console.error("MCU standalone error:", e.message);
            return [];
        }
    },

    marvel_series: async () => {
        const cached = getCached("marvel_series");
        if (cached) return cached;
        try {
            const studioShows = await fetchAllPages(`/discover/tv?with_companies=${MARVEL_STUDIOS}&sort_by=first_air_date.asc`);
            const entShows = await fetchAllPages(`/discover/tv?with_companies=${MARVEL_ENTERTAINMENT}&sort_by=first_air_date.asc`);
            const combined = studioShows.concat(entShows);
            const seen = new Set();
            const unique = combined.filter(s => {
                if (seen.has(s.id)) return false;
                seen.add(s.id);
                return true;
            });
            const result = sortSeries(unique).map(fmtSeries);
            setCache("marvel_series", result);
            return result;
        } catch (e) {
            console.error("Marvel series error:", e.message);
            return [];
        }
    },

    other_marvel: async () => {
        const cached = getCached("other_marvel");
        if (cached) return cached;
        try {
            let collectionMovies = [];
            for (const id of OTHER_COLLECTIONS) {
                try {
                    collectionMovies = collectionMovies.concat(await fetchCollection(id));
                } catch (e) {}
            }
            let standaloneMovies = [];
            for (const id of STANDALONE_MARVEL_IDS) {
                try {
                    const data = await tmdbGet(`/movie/${id}`);
                    if (data && data.id) standaloneMovies.push(data);
                } catch (e) {}
            }
            const discoverMovies = await fetchAllPages(`/discover/movie?with_companies=${MARVEL_ENTERTAINMENT}&sort_by=release_date.asc`);
            let all = collectionMovies.concat(standaloneMovies).concat(discoverMovies);
            const mcuMovies = await fetchAllPages(`/discover/movie?with_companies=${MARVEL_STUDIOS}&sort_by=release_date.asc`);
            const mcuIds = new Set(mcuMovies.map(m => m.id));
            const avengers = await fetchCollection(AVENGERS_COLLECTION);
            avengers.forEach(m => mcuIds.add(m.id));
            const xmenIds = new Set();
            for (const id of XMEN_COLLECTIONS) {
                try {
                    const movies = await fetchCollection(id);
                    movies.forEach(m => xmenIds.add(m.id));
                } catch (e) {}
            }
            const result = sortMovies(dedupe(all).filter(m => !mcuIds.has(m.id) && !xmenIds.has(m.id))).map(fmtMovie);
            setCache("other_marvel", result);
            return result;
        } catch (e) {
            console.error("Other Marvel error:", e.message);
            return [];
        }
    }
};

const manifest = {
    id: "com.marvel.universe",
    version: "2.0.0",
    name: "Marvel Universe",
    description: "All Marvel movies and series — Avengers, X-Men, MCU, and more — sorted by release date.",
    icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/MarvelLogo.svg/1200px-MarvelLogo.svg.png",
    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    catalogs: [
        {
            type: "movie",
            id: "avengers",
            name: "Avengers",
            extra: [{ name: "skip", isRequired: false }]
        },
        {
            type: "movie",
            id: "xmen",
            name: "X-Men Universe",
            extra: [{ name: "skip", isRequired: false }]
        },
        {
            type: "movie",
            id: "mcu_standalone",
            name: "MCU Movies",
            extra: [{ name: "skip", isRequired: false }]
        },
        {
            type: "series",
            id: "marvel_series",
            name: "Marvel Series",
            extra: [{ name: "skip", isRequired: false }]
        },
        {
            type: "movie",
            id: "other_marvel",
            name: "Other Marvel",
            extra: [{ name: "skip", isRequired: false }]
        }
    ],
    idPrefixes: ["tmdb:"],
    behaviorHints: {
        configurable: true,
        configurationRequired: false
    }
};

app.get("/manifest.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(manifest);
});

app.get("/catalog/:type/:id/:extra?.json", async (req, res) => {
    const { id, extra } = req.params;
    const fetcher = catalogFetchers[id];

    if (!fetcher) {
        return res.json({ metas: [] });
    }

    let skip = 0;
    if (extra) {
        const params = {};
        extra.split("&").forEach(p => {
            const [k, v] = p.split("=");
            if (k && v) params[k] = v;
        });
        if (params.skip) skip = parseInt(params.skip);
    }

    const items = await fetcher();
    const metas = items.slice(skip, skip + 100).map(item => ({
        id: item.id,
        type: item.type,
        name: item.name,
        poster: item.poster,
        description: item.description,
        year: item.year
    }));

    res.json({ metas });
});

app.get("/meta/:type/:id.json", async (req, res) => {
    const { type, id } = req.params;
    const tmdbId = id.replace("tmdb:", "");

    try {
        if (type === "movie") {
            const data = await tmdbGet(`/movie/${tmdbId}`);
            res.json({
                meta: {
                    id: `tmdb:${data.id}`,
                    type: "movie",
                    name: data.title,
                    poster: data.poster_path ? `${IMG}/w500${data.poster_path}` : null,
                    background: data.backdrop_path ? `${IMG}/w1280${data.backdrop_path}` : null,
                    description: data.overview,
                    releaseInfo: data.release_date ? data.release_date.split("-")[0] : undefined,
                    runtime: data.runtime ? `${data.runtime} min` : undefined,
                    genres: data.genres ? data.genres.map(g => g.name) : []
                }
            });
        } else if (type === "series") {
            const data = await tmdbGet(`/tv/${tmdbId}`);
            res.json({
                meta: {
                    id: `tmdb:${data.id}`,
                    type: "series",
                    name: data.name,
                    poster: data.poster_path ? `${IMG}/w500${data.poster_path}` : null,
                    background: data.backdrop_path ? `${IMG}/w1280${data.backdrop_path}` : null,
                    description: data.overview,
                    releaseInfo: data.first_air_date ? data.first_air_date.split("-")[0] : undefined,
                    genres: data.genres ? data.genres.map(g => g.name) : []
                }
            });
        } else {
            res.json({ meta: {} });
        }
    } catch (e) {
        console.error("Meta error:", e.message);
        res.json({ meta: {} });
    }
});

app.get("/", (req, res) => {
    const host = req.get("host");
    const protocol = req.protocol;
    const manifestUrl = `${protocol}://${host}/manifest.json`;
    const stremioUrl = manifestUrl.replace("https://", "stremio://").replace("http://", "stremio://");

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Marvel Universe — Stremio Addon</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 50%, #0a0a1a 100%); color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
            .container { max-width: 640px; width: 100%; background: rgba(30, 30, 30, 0.9); padding: 40px; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); border: 1px solid rgba(226, 54, 54, 0.15); }
            h1 { color: #e23636; font-size: 28px; margin-bottom: 8px; }
            .subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
            .catalogs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 24px 0; }
            .catalog-tag { background: rgba(138, 90, 150, 0.15); border: 1px solid rgba(138, 90, 150, 0.3); padding: 10px 14px; border-radius: 8px; font-size: 13px; color: #c9a0d6; text-align: center; }
            .btn { display: inline-block; background: linear-gradient(135deg, #e23636, #8a5a96); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 20px; transition: transform 0.2s, box-shadow 0.2s; }
            .btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(226, 54, 54, 0.3); }
            p { line-height: 1.7; color: #bbb; font-size: 15px; margin-bottom: 12px; }
            .url-box { background: #000; padding: 12px 16px; border-radius: 8px; word-break: break-all; color: #8a5a96; font-family: monospace; font-size: 13px; margin-top: 16px; border: 1px solid #222; }
            .divider { border: none; border-top: 1px solid #333; margin: 28px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Marvel Universe</h1>
            <p class="subtitle">Stremio Addon v2.0</p>
            <p>All Marvel movies and series organized into catalogs and sorted by release date.</p>
            <div class="catalogs">
                <div class="catalog-tag">🛡️ Avengers</div>
                <div class="catalog-tag">🧬 X-Men Universe</div>
                <div class="catalog-tag">🎬 MCU Movies</div>
                <div class="catalog-tag">📺 Marvel Series</div>
                <div class="catalog-tag">🕷️ Other Marvel</div>
            </div>
            <div style="text-align: center;">
                <a href="${stremioUrl}" class="btn">Install in Stremio</a>
            </div>
            <hr class="divider">
            <p>Or copy the manifest URL and paste it into Stremio's addon search bar:</p>
            <div class="url-box">${manifestUrl}</div>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Marvel Universe Addon running on port ${PORT}`);
});