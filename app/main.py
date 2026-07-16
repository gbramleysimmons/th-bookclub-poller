"""FastAPI app: ranked-choice (Borda count) group polling.

Serves both the JSON API and the mobile-friendly static frontend.
"""
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .borda import borda_scores
from .cosmos import ConflictError, get_store, new_poll_doc
from .models import CreatePollRequest, VoteRequest

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Borda Count Poller", version="1.0.0")


def _public_poll(poll: dict) -> dict:
    """Poll view without exposing individual ballots beyond count."""
    return {
        "shortcode": poll["shortcode"],
        "title": poll["title"],
        "options": poll["options"],
        "voteCount": len(poll.get("votes", [])),
        "createdAt": poll.get("createdAt"),
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/polls", status_code=201)
def create_poll(req: CreatePollRequest):
    store = get_store()
    doc = new_poll_doc(req.shortcode, req.title, req.options)
    try:
        store.create_poll(doc)
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return _public_poll(doc)


@app.get("/api/polls/{shortcode}")
def get_poll(shortcode: str):
    poll = get_store().get_poll(shortcode.lower())
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found.")
    return _public_poll(poll)


@app.post("/api/polls/{shortcode}/vote")
def vote(shortcode: str, req: VoteRequest):
    store = get_store()
    poll = store.get_poll(shortcode.lower())
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found.")

    n = len(poll["options"])
    unique = list(dict.fromkeys(req.ranking))  # de-dupe, preserve order
    if len(unique) != len(req.ranking):
        raise HTTPException(status_code=400, detail="Ranking has duplicate options.")
    if any(i < 0 or i >= n for i in req.ranking):
        raise HTTPException(status_code=400, detail="Ranking references invalid option.")
    if len(req.ranking) != n:
        raise HTTPException(status_code=400, detail="You must rank every option.")

    votes = poll.setdefault("votes", [])
    ballot = {"voter": req.voter, "ranking": req.ranking}
    for i, existing in enumerate(votes):
        if existing["voter"].lower() == req.voter.lower():
            votes[i] = ballot  # re-voting updates the ballot
            break
    else:
        votes.append(ballot)

    store.upsert_poll(poll)
    return {"status": "recorded", "voteCount": len(votes)}


@app.get("/api/polls/{shortcode}/results")
def results(shortcode: str):
    poll = get_store().get_poll(shortcode.lower())
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found.")
    ballots = [v["ranking"] for v in poll.get("votes", [])]
    return {
        "shortcode": poll["shortcode"],
        "title": poll["title"],
        "voteCount": len(ballots),
        "results": borda_scores(poll["options"], ballots),
    }


# --- Frontend routes ---------------------------------------------------------
@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/p/{shortcode}")
def poll_page(shortcode: str):
    # Shareable poll URL — the SPA reads the shortcode from the path.
    return FileResponse(STATIC_DIR / "index.html")


# Mount remaining static assets (css/js). Kept last so API routes win.
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
