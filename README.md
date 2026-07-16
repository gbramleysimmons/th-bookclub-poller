# Ranked Poll — Borda count group polling

A mobile-friendly ranked-choice polling app for groups. Create a poll with a
custom shortcode, share the URL, let people rank the options, and see the
winner computed with the **Borda count** algorithm.

## Features
- Create polls with a custom shortcode
- Join a poll by shortcode
- Rank options (mobile-friendly reordering) and vote
- Live results via Borda count
- Shareable poll URLs (`/p/<shortcode>`)

## Tech
- **Backend/API + frontend host:** Python FastAPI
- **Storage:** Azure Cosmos DB (serverless) — falls back to an in-memory store locally
- **Hosting:** Azure Web App (Linux, Python 3.12)
- **CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`)

## Borda count
For a poll with N options, a ballot ranks all options. An option placed at
position *i* (0-based, most preferred first) earns `N - 1 - i` points. Points
are summed across all ballots; highest total wins.

## Run locally
```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
# open http://localhost:8000
```
Without `COSMOS_ENDPOINT`/`COSMOS_KEY` set, an in-memory store is used.

## Configuration (env vars)
| Variable          | Purpose                         |
|-------------------|---------------------------------|
| `COSMOS_ENDPOINT` | Cosmos DB account endpoint      |
| `COSMOS_KEY`      | Cosmos DB primary key           |
| `COSMOS_DATABASE` | Database name (default `borda`) |
| `COSMOS_CONTAINER`| Container name (default `polls`)|

## API
| Method | Path                              | Description          |
|--------|-----------------------------------|----------------------|
| POST   | `/api/polls`                      | Create a poll        |
| GET    | `/api/polls/{shortcode}`          | Poll details         |
| POST   | `/api/polls/{shortcode}/vote`     | Submit a ranked vote |
| GET    | `/api/polls/{shortcode}/results`  | Borda count results  |

## Deployment
Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
deploys to the Azure Web App using the publish-profile secret
`AZUREAPPSERVICE_PUBLISHPROFILE`.
