---
to: tests/test_graphql.py
---
from fastapi.testclient import TestClient

from app.main import create_app


def test_health_query_answers() -> None:
    """One operation through the whole transport: routing, context, resolver, serialisation."""
    with TestClient(create_app()) as client:
        response = client.post("/graphql", json={"query": "{ health { status service } }"})

    assert response.status_code == 200
    body = response.json()
    assert "errors" not in body
    assert body["data"]["health"] == {"status": "ok", "service": "<%= spec.meta.slug %>"}


def test_schema_is_served_as_sdl() -> None:
    """``/schema.graphql`` is what the Service Catalog reads; it must be the running schema."""
    with TestClient(create_app()) as client:
        response = client.get("/schema.graphql")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert "type Query" in response.text
    assert "health: Health!" in response.text


def test_unknown_field_is_a_graphql_error_not_a_500() -> None:
    """Validation failures come back in the GraphQL envelope, not the REST one."""
    with TestClient(create_app()) as client:
        response = client.post("/graphql", json={"query": "{ nope }"})

    assert response.status_code == 200
    body = response.json()
    assert body.get("data") is None
    assert body["errors"][0]["message"].startswith("Cannot query field")
