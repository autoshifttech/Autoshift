"""A tiny stand-in for PostgREST, for end-to-end tests against a real Postgres.

Speaks only the subset SupabaseDb uses (eq filters, order, limit, insert, patch, delete,
upsert, rpc) and, like Supabase, switches to the `service_role` or `authenticated` database
role per request, so real row-level security applies to user-token calls.
"""

import json
import re

import jwt
import psycopg
from psycopg import sql
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")


def make_app(dsn: str, service_key: str, jwt_secret: str) -> Starlette:
    async def handle(request: Request) -> Response:
        name = request.path_params["name"].removeprefix("rpc/")
        if not IDENT.match(name):
            return JSONResponse({"message": "bad name"}, 400)
        bearer = request.headers.get("authorization", "")[7:]
        body = await request.json() if request.method in ("POST", "PATCH") and await request.body() else None
        try:
            async with await psycopg.AsyncConnection.connect(dsn) as conn:
                async with conn.transaction():
                    if bearer == service_key:
                        await conn.execute("SET LOCAL ROLE service_role")
                    else:
                        claims = jwt.decode(bearer, jwt_secret, algorithms=["HS256"], audience="authenticated")
                        await conn.execute("SET LOCAL ROLE authenticated")
                        await conn.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (claims["sub"],))
                    cur = conn.cursor()
                    return await run(cur, request, name, body)
        except jwt.PyJWTError:
            return JSONResponse({"message": "bad token"}, 401)
        except psycopg.errors.InsufficientPrivilege as exc:
            return JSONResponse({"message": str(exc)}, 403)
        except psycopg.errors.IntegrityError as exc:
            return JSONResponse({"message": str(exc)}, 409)
        except psycopg.Error as exc:
            return JSONResponse({"message": str(exc)}, 400)

    async def run(cur, request: Request, name: str, body):
        if request.url.path.startswith("/rest/v1/rpc/"):
            args = [sql.SQL("{} := {}").format(sql.Identifier(k), sql.Placeholder()) for k in body]
            q = sql.SQL("SELECT to_jsonb({}({}))").format(sql.Identifier(name), sql.SQL(", ").join(args))
            await cur.execute(q, list(body.values()))
            return JSONResponse((await cur.fetchone())[0])

        table = sql.Identifier(name)
        params = dict(request.query_params)
        order, limit, on_conflict = params.pop("order", None), params.pop("limit", None), params.pop("on_conflict", None)
        where, args = [], []
        for col, val in params.items():
            assert IDENT.match(col) and val.startswith("eq.")
            where.append(sql.SQL("t.{}::text = %s").format(sql.Identifier(col)))
            args.append(val[3:])
        w = sql.SQL(" WHERE ") + sql.SQL(" AND ").join(where) if where else sql.SQL("")
        m = request.method

        if m == "GET":
            q = sql.SQL("SELECT to_jsonb(t) FROM {} t").format(table) + w
            if order:
                col, _, d = order.partition(".")
                q += sql.SQL(" ORDER BY t.{} {}").format(sql.Identifier(col), sql.SQL("DESC" if d == "desc" else "ASC"))
            if limit:
                q += sql.SQL(" LIMIT {}").format(sql.Literal(int(limit)))
            await cur.execute(q, args)
        elif m == "POST":
            cols = [sql.Identifier(c) for c in body]
            q = sql.SQL("INSERT INTO {t} ({c}) SELECT {c} FROM jsonb_populate_record(NULL::{t}, %s::jsonb)").format(t=table, c=sql.SQL(", ").join(cols))
            if on_conflict:
                keys = [sql.Identifier(c) for c in on_conflict.split(",")]
                sets = sql.SQL(", ").join(sql.SQL("{c} = EXCLUDED.{c}").format(c=sql.Identifier(c)) for c in body if c not in on_conflict.split(","))
                q += sql.SQL(" ON CONFLICT ({}) DO UPDATE SET {}").format(sql.SQL(", ").join(keys), sets)
            q += sql.SQL(" RETURNING to_jsonb({}.*)").format(table)
            await cur.execute(q, [json.dumps(body)])
        elif m == "PATCH":
            sets = sql.SQL(", ").join(sql.SQL("{c} = r.{c}").format(c=sql.Identifier(c)) for c in body)
            q = sql.SQL("UPDATE {t} t SET {s} FROM (SELECT * FROM jsonb_populate_record(NULL::{t}, %s::jsonb)) r").format(t=table, s=sets) + w + sql.SQL(" RETURNING to_jsonb(t)")
            await cur.execute(q, [json.dumps(body), *args])
        elif m == "DELETE":
            await cur.execute(sql.SQL("DELETE FROM {} t").format(table) + w + sql.SQL(" RETURNING to_jsonb(t)"), args)
        else:
            return JSONResponse({"message": "unsupported"}, 405)
        rows = [r[0] for r in await cur.fetchall()] if cur.description else []
        return JSONResponse(rows, 201 if m == "POST" else 200)

    return Starlette(routes=[Route("/rest/v1/{name:path}", handle, methods=["GET", "POST", "PATCH", "DELETE"])])
