# Docker Infrastructure

Local development services for the VAYA monorepo.

## Services

| Service  | Port | Purpose                      |
| -------- | ---- | ---------------------------- |
| Postgres | 5433 | Primary database             |
| Redis    | 6379 | Caching, rate limiting, jobs |

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

## Notes

- Redis is optional and not required for basic API operation.
- Data is persisted in Docker volumes.
- These services are for local development only.
