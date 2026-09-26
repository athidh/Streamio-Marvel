require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 7000;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_MCU_COLLECTION_ID = process.env.TMDB_MCU_COLLECTION_ID || "86311";

async function getMCUMovies() {
    if (!TMDB_API_KEY) {
        console.error("TMDB_API_KEY is not set. Please add it to your environment variables.");
        return [];
    }

    try {
        const url = `https://api.themoviedb.org/3/collection/${TMDB_MCU_COLLECTION_ID}?api_key=${TMDB_API_KEY}&language=en-US`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`TMDB API responded with status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.parts || !Array.isArray(data.parts)) {
            return [];
        }

        const sortedMovies = data.parts
            .filter(movie => movie.release_date)
            .sort((a, b) => new Date(a.release_date) - new Date(b.release_date));

        return sortedMovies.map(movie => ({
            id: `tmdb:${movie.id}`,
            type: "movie",
            name: movie.title,
            poster: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
            background: `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`,
            description: movie.overview,
            year: movie.release_date.split('-')[0],
            runtime: movie.runtime ? `${movie.runtime} min` : undefined
        }));

    } catch (error) {
        console.error("Error fetching MCU movies from TMDB:", error);
        return [];
    }
}

const manifest = {
    id: "com.mcu.chronological",
    version: "1.0.0",
    name: "MCU Chronological Order",
    description: "Watch the Marvel Cinematic Universe movies and shows in timeline order.",
    icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/MarvelLogo.svg/1200px-MarvelLogo.svg.png",
    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    catalogs: [
        {
            type: "movie",
            id: "mcu_timeline",
            name: "MCU Timeline",
            extra: [
                { name: "search", isRequired: false },
                { name: "skip", isRequired: false }
            ]
        }
    ],
    idPrefixes: ["tt", "tmdb:"],
    behaviorHints: {
        configurable: true,
        configurationRequired: false
    }
};

app.get("/manifest.json", (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(manifest);
});

app.get("/catalog/:type/:id/:extra?.json", async (req, res) => {
    const { type, id, extra } = req.params;

    if (id === "mcu_timeline") {
        let skip = 0;
        if (extra) {
            const extraObj = {};
            extra.split('&').forEach(param => {
                const parts = param.split('=');
                if (parts.length === 2) {
                    extraObj[parts[0]] = parts[1];
                }
            });
            if (extraObj.skip) skip = parseInt(extraObj.skip);
        }

        const movieList = await getMCUMovies();

        const metas = movieList.slice(skip, skip + 100).map(item => ({
            id: item.id,
            type: item.type,
            name: item.name,
            poster: item.poster,
            description: item.description,
            year: item.year
        }));

        res.json({ metas: metas });
    } else {
        res.json({ metas: [] });
    }
});

app.get("/meta/:type/:id.json", async (req, res) => {
    const { type, id } = req.params;
    const movieList = await getMCUMovies();
    const item = movieList.find(m => m.id === id);

    if (item) {
        res.json({
            meta: {
                id: item.id,
                type: item.type,
                name: item.name,
                poster: item.poster,
                background: item.poster,
                description: item.description,
                releaseInfo: item.year,
                runtime: item.runtime
            }
        });
    } else {
        res.json({ meta: {} });
    }
});

app.get("/", (req, res) => {
    const host = req.get('host');
    const protocol = req.protocol;
    const manifestUrl = `${protocol}://${host}/manifest.json`;
    const stremioInstallUrl = manifestUrl.replace('https://', 'stremio://').replace('http://', 'stremio://');

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MCU Chronological Addon</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #121212; color: #fff; text-align: center; padding: 50px; }
            h1 { color: #e23636; }
            .container { max-width: 600px; margin: 0 auto; background: #1e1e1e; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
            .btn { display: inline-block; background-color: #8a5a96; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 20px; transition: background-color 0.2s;}
            .btn:hover { background-color: #6b4674; }
            p { line-height: 1.6; color: #ccc; }
            .url-box { background: #000; padding: 10px; border-radius: 4px; word-break: break-all; margin-top: 20px; color: #8a5a96; font-family: monospace; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>MCU Chronological Order</h1>
            <p>This is a Stremio addon that provides a catalog of Marvel Cinematic Universe movies sorted in chronological timeline order.</p>
            <p>Click the button below to install it directly if you have Stremio installed on this device.</p>
            <a href="${stremioInstallUrl}" class="btn">Install Addon in Stremio</a>
            <div style="margin-top: 40px; border-top: 1px solid #333; padding-top: 20px;">
                <p>Alternatively, you can copy the manifest URL below and paste it into the search bar in Stremio's Addons section:</p>
                <div class="url-box">${manifestUrl}</div>
            </div>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`MCU Chronological Addon running on port ${PORT}`);
});