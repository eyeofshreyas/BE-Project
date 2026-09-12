"""Regenerates postman_collection.json from the live OpenAPI schema.

Run after adding/changing routes:  .venv/bin/python gen_postman.py
Request bodies are sample JSON built from each operation's schema; path/query
params become {{placeholders}} you fill in Postman.
"""
import json
import re

from app.main import app

NOAUTH = {"/", "/signup", "/login", "/forgot-password"}
LOGIN_SCRIPT = [
    "const data = pm.response.json();",
    "if (data.access_token) { pm.collectionVariables.set('access_token', data.access_token); }",
]


def sample(schema, spec, depth=0):
    """Build a placeholder value for an OpenAPI schema node."""
    if depth > 4 or not isinstance(schema, dict):
        return None
    if "$ref" in schema:
        name = schema["$ref"].rsplit("/", 1)[1]
        return sample(spec["components"]["schemas"][name], spec, depth + 1)
    for key in ("anyOf", "oneOf", "allOf"):
        if key in schema:
            # anyOf is usually `X | null` -- take the first non-null branch.
            branches = [s for s in schema[key] if s.get("type") != "null"]
            return sample(branches[0], spec, depth + 1) if branches else None
    if "default" in schema:
        return schema["default"]
    if "enum" in schema:
        return schema["enum"][0]
    t = schema.get("type")
    if t == "object" or "properties" in schema:
        return {k: sample(v, spec, depth + 1) for k, v in schema.get("properties", {}).items()}
    if t == "array":
        return [sample(schema.get("items", {}), spec, depth + 1)]
    if t == "integer":
        return 1
    if t == "number":
        return 1.0
    if t == "boolean":
        return True
    return {"date": "2026-01-01", "date-time": "2026-01-01T10:00:00", "email": "user@example.com"}.get(
        schema.get("format"), "string"
    )


def build_request(path, method, op, spec):
    params = op.get("parameters", [])
    # path params -> {{case_id}} so Postman surfaces them as variables
    raw_path = path
    for p in params:
        if p["in"] == "path":
            raw_path = raw_path.replace("{%s}" % p["name"], "{{%s}}" % p["name"])
    query = [
        {"key": p["name"], "value": str(sample(p.get("schema", {}), spec)), "disabled": not p.get("required")}
        for p in params
        if p["in"] == "query"
    ]
    qs = "&".join("%s=%s" % (q["key"], q["value"]) for q in query if not q["disabled"])
    raw = "{{base_url}}%s%s" % (raw_path, "?" + qs if qs else "")
    url = {"raw": raw, "host": ["{{base_url}}"], "path": [s for s in raw_path.strip("/").split("/") if s]}
    if query:
        url["query"] = query

    req = {"method": method.upper(), "header": [], "url": url}
    if path in NOAUTH:
        req["auth"] = {"type": "noauth"}

    content = (op.get("requestBody") or {}).get("content", {})
    if "application/json" in content:
        req["header"].append({"key": "Content-Type", "value": "application/json"})
        req["body"] = {
            "mode": "raw",
            "raw": json.dumps(sample(content["application/json"]["schema"], spec), indent=2),
            "options": {"raw": {"language": "json"}},
        }
    elif "multipart/form-data" in content:
        props = sample(content["multipart/form-data"]["schema"], spec) or {}
        req["body"] = {
            "mode": "formdata",
            "formdata": [
                {"key": k, "type": "file" if k == "file" else "text", "value": "" if k == "file" else str(v)}
                for k, v in props.items()
            ],
        }

    item = {"name": op.get("summary") or "%s %s" % (method.upper(), path), "request": req}
    if path == "/login":
        item["event"] = [{"listen": "test", "script": {"type": "text/javascript", "exec": LOGIN_SCRIPT}}]
    return item


def main():
    spec = app.openapi()
    folders = {}
    path_vars = set()
    for path, ops in spec["paths"].items():
        path_vars.update(re.findall(r"\{(\w+)\}", path))
        for method, op in ops.items():
            tag = (op.get("tags") or ["general"])[0].replace("-", " ").title()
            folders.setdefault(tag, []).append(build_request(path, method, op, spec))

    collection = {
        "info": {
            "name": "LexFlow Backend",
            "description": (
                "Auto-generated from the FastAPI OpenAPI schema by backend/gen_postman.py -- "
                "do not hand-edit; re-run the script after changing routes. Start the backend first "
                "(cd backend && source .venv/bin/activate && uvicorn app.main:app --reload). Every "
                "endpoint except Root/Signup/Login/Forgot Password requires auth: run Login once with "
                "a real account and its test script fills the access_token collection variable. Path "
                "params are {{variables}} -- set them in the collection Variables tab. Bodies are "
                "schema-derived placeholders; replace the sample values."
            ),
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "variable": [
            {"key": "base_url", "value": "http://localhost:8000"},
            {"key": "access_token", "value": ""},
        ] + [{"key": v, "value": ""} for v in sorted(path_vars)],
        "auth": {"type": "bearer", "bearer": [{"key": "token", "value": "{{access_token}}", "type": "string"}]},
        "item": [{"name": name, "item": items} for name, items in sorted(folders.items())],
    }
    with open("postman_collection.json", "w") as f:
        json.dump(collection, f, indent=2)
        f.write("\n")
    print("wrote postman_collection.json: %d requests in %d folders" % (
        sum(len(i) for i in folders.values()), len(folders)))


if __name__ == "__main__":
    main()
