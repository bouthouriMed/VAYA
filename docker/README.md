# Docker Infrastructure

Local development services for the VAYA monorepo.

## Services

| Service  | Port | Purpose                           |
| -------- | ---- | --------------------------------- |
| Postgres | 5433 | Primary database                  |
| Redis    | 6379 | Caching, rate limiting, jobs      |
| OSRM     | 5001 | Real driving routes/ETA (Tunisia) |

## Usage

Start all services:

```bash
docker compose up -d
```

Start only PostgreSQL:

```bash
docker compose up postgres -d
```

View logs:

```bash
docker compose logs -f
```

Stop all services:

```bash
docker compose down
```

Stop and remove volumes:

```bash
docker compose down -v
```

## Connection

- PostgreSQL: `postgresql://vaya:vaya_dev@localhost:5433/vaya`

Mapped to host port 5433 (not the default 5432) to avoid colliding with a natively-installed PostgreSQL service.

- Redis: `redis://localhost:6379`
- OSRM: `http://localhost:5001`

## OSRM (routing engine) one-time setup

The `osrm` service needs a pre-processed routing graph before it can serve
requests — `docker compose up` alone will start it, but it exits immediately
until this is done once:

```bash
cd docker/osrm
./prepare.sh
```

This downloads a Tunisia road-network extract from Geofabrik (~50-100MB) and
runs it through `osrm-extract`/`osrm-contract`. Takes a few minutes; only
needs to be re-run if you want to refresh the map data. Once done:

```bash
docker compose up osrm -d
curl "http://localhost:5001/route/v1/driving/10.1815,36.8065;10.2413,36.8419?overview=false"
```

If OSRM isn't running or hasn't been prepared, `apps/api`'s routing client
(`lib/routing.ts`) falls back to a straight-line haversine estimate instead
of failing outright — real polylines/ETAs just won't be available until this
step is done.

## Notes

- Redis is optional and not required for basic API operation.
- OSRM is optional the same way — the API degrades to straight-line
  distance estimates without it.
- Data is persisted in Docker volumes (Postgres/Redis) or in
  `docker/osrm/data/` (OSRM, gitignored — regenerate via `prepare.sh` rather
  than committing it).
- These services are for local development only.
