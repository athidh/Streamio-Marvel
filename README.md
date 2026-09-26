# MCU Chronological Order — Stremio Addon

A Stremio addon that provides a catalog of Marvel Cinematic Universe movies sorted in chronological timeline order, powered by the TMDB API.

![Marvel](https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/MarvelLogo.svg/400px-MarvelLogo.svg.png)

## Features

- Automatically fetches the latest MCU movie list from TMDB
- Movies sorted in release chronological order
- One-click install page for Stremio
- Ready for cloud deployment (Render, Railway, etc.)

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A free TMDB API key — get one at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
- [Stremio](https://www.stremio.com/) installed on your device

## Local Setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/YOUR_USERNAME/Streamio-Marvel.git
   cd Streamio-Marvel
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy the example env file and add your TMDB API key:

   ```bash
   cp .env.example .env
   ```

   Open `.env` and replace `your_tmdb_api_key_here` with your actual key:

   ```
   TMDB_API_KEY=your_actual_api_key
   TMDB_MCU_COLLECTION_ID=86311
   PORT=7000
   ```

4. **Start the server**

   ```bash
   npm start
   ```

5. **Install in Stremio**

   Open `http://localhost:7000` in your browser and click **Install Addon in Stremio**, or paste the manifest URL into Stremio's addon search bar:

   ```
   http://localhost:7000/manifest.json
   ```

## Deploy to Render

1. Push this repo to GitHub (make sure `.env` is **not** committed — it's in `.gitignore`)

2. Go to [render.com](https://render.com) and create a **New Web Service**

3. Connect your GitHub repository

4. Configure the service:

   | Setting | Value |
   |---|---|
   | **Runtime** | Node |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |

5. Add your environment variable under **Environment → Environment Variables**:

   | Key | Value |
   |---|---|
   | `TMDB_API_KEY` | your actual TMDB API key |

   > `PORT` is set automatically by Render — no need to add it.
   > `TMDB_MCU_COLLECTION_ID` defaults to `86311` if not set.

6. Click **Deploy** and wait for the build to finish

7. Once live, open your Render URL (e.g. `https://your-app.onrender.com`) and click the install button, or add the manifest URL to Stremio:

   ```
   https://your-app.onrender.com/manifest.json
   ```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TMDB_API_KEY` | Yes | — | Your TMDB API key |
| `TMDB_MCU_COLLECTION_ID` | No | `86311` | TMDB collection ID for MCU movies |
| `PORT` | No | `7000` | Port the server runs on |

## Project Structure

```
Streamio-Marvel/
├── addon.js          # Main addon server
├── package.json      # Dependencies and scripts
├── .env              # Your local environment variables (not committed)
├── .env.example      # Template for environment variables
├── .gitignore        # Files excluded from git
└── README.md         # This file
```

## License

MIT
