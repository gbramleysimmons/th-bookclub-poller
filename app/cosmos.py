"""Cosmos DB data access with an in-memory fallback for local dev.

If COSMOS_ENDPOINT and COSMOS_KEY are set, the app uses Azure Cosmos DB.
Otherwise it falls back to an in-memory store so the app can run locally
without any Azure dependency.
"""
import os
import threading
from datetime import datetime, timezone
from typing import List, Optional

DATABASE_NAME = os.environ.get("COSMOS_DATABASE", "borda")
CONTAINER_NAME = os.environ.get("COSMOS_CONTAINER", "polls")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class _MemoryStore:
    """Simple thread-safe in-memory store used when Cosmos is not configured."""

    def __init__(self):
        self._polls = {}
        self._lock = threading.Lock()

    def get_poll(self, shortcode: str) -> Optional[dict]:
        with self._lock:
            poll = self._polls.get(shortcode)
            return dict(poll) if poll else None

    def create_poll(self, poll: dict) -> dict:
        with self._lock:
            if poll["shortcode"] in self._polls:
                raise ConflictError(poll["shortcode"])
            self._polls[poll["shortcode"]] = poll
            return dict(poll)

    def upsert_poll(self, poll: dict) -> dict:
        with self._lock:
            self._polls[poll["shortcode"]] = poll
            return dict(poll)


class ConflictError(Exception):
    """Raised when creating a poll whose shortcode already exists."""

    def __init__(self, shortcode: str):
        super().__init__(f"Poll '{shortcode}' already exists.")
        self.shortcode = shortcode


class _CosmosStore:
    def __init__(self, endpoint: str, key: str):
        from azure.cosmos import CosmosClient, PartitionKey, exceptions

        self._exceptions = exceptions
        client = CosmosClient(endpoint, credential=key)
        db = client.create_database_if_not_exists(id=DATABASE_NAME)
        self._container = db.create_container_if_not_exists(
            id=CONTAINER_NAME,
            partition_key=PartitionKey(path="/shortcode"),
        )

    def get_poll(self, shortcode: str) -> Optional[dict]:
        try:
            return self._container.read_item(item=shortcode, partition_key=shortcode)
        except self._exceptions.CosmosResourceNotFoundError:
            return None

    def create_poll(self, poll: dict) -> dict:
        try:
            return self._container.create_item(body=poll)
        except self._exceptions.CosmosResourceExistsError:
            raise ConflictError(poll["shortcode"])

    def upsert_poll(self, poll: dict) -> dict:
        return self._container.upsert_item(body=poll)


def _build_store():
    endpoint = os.environ.get("COSMOS_ENDPOINT")
    key = os.environ.get("COSMOS_KEY")
    if endpoint and key:
        return _CosmosStore(endpoint, key)
    return _MemoryStore()


_store = None
_store_lock = threading.Lock()


def get_store():
    global _store
    if _store is None:
        with _store_lock:
            if _store is None:
                _store = _build_store()
    return _store


def new_poll_doc(shortcode: str, title: str, options: List[str]) -> dict:
    return {
        "id": shortcode,
        "shortcode": shortcode,
        "title": title,
        "options": options,
        "votes": [],
        "createdAt": _now(),
    }
