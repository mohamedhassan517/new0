# OfflineApp – Docker Deployment

This repository is ready to deploy on a VPS using Docker. The app builds a React SPA and an Express API into a single container. Persistence defaults to SQLite (stored in `/app/data`), with optional MySQL support via Docker Compose.

## Prerequisites
- Docker Engine 24+
- Docker Compose plugin
- A VPS with ports `3000` (app) and optionally `3306` (MySQL) open

## Quick Start (SQLite, single container)
1. Copy env file:
   ```bash
   cp .env.example .env
   ```
   Leave `LOCAL_DB_DIR=/app/data` for SQLite persistence.
2. Build and run:
   ```bash
   docker compose up -d --build
   ```
3. Open the app:
   - App: `http://<your-vps-ip>:3000`
   - API health: `http://<your-vps-ip>:3000/health`

On first run, a default manager user is created:
- Username: `root`
- Password: `password123`

Data is persisted in the `app_data` Docker volume (mapped to `/app/data` in the container). Backups should target that volume.

## MySQL Mode (optional)
If you prefer MySQL over SQLite:
1. Edit `.env` and set values:
   ```env
   MYSQL_HOST=mysql
   MYSQL_PORT=3306
   MYSQL_DATABASE=app
   MYSQL_USER=app
   MYSQL_PASSWORD=apppw
   MYSQL_ROOT_PASSWORD=rootpw
   ```
2. Keep the `mysql` service in `docker-compose.yml` and run:
   ```bash
   docker compose up -d --build
   ```
The server auto-creates tables and seeds the default manager user on first start.

Note: The app attempts MySQL if those env vars are set; ensure MySQL starts quickly, otherwise the app will start with in-memory fallback until MySQL becomes reachable.

## Useful Commands
- View logs:
  ```bash
  docker compose logs -f app
  ```
- Rebuild after code changes:
  ```bash
  docker compose up -d --build
  ```
- Stop:
  ```bash
  docker compose down
  ```
- Backup SQLite data:
  ```bash
  docker run --rm -v offlineapp_app_data:/data -v "$PWD":/backup alpine sh -c 'cp -r /data/* /backup/'
  ```

## Environment Variables
Key variables in `.env`:
- `PORT` – external port published by Compose (default `3000`)
- `PING_MESSAGE` – simple `/api/ping` response for diagnostics
- `LOCAL_DB_DIR` – directory for SQLite DB inside the container (default `/app/data`)
- MySQL (optional): `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
- MySQL root password used by Compose: `MYSQL_ROOT_PASSWORD`

## How It Works
- Multi-stage Docker build compiles the SPA and backend into `dist/`
- Runtime container runs `node dist/server/node-build.cjs` which serves:
  - Static SPA from `dist/spa`
  - REST API under `/api/*`
  - Health endpoint at `/health`
- Database selection:
  - If MySQL env vars are set, uses MySQL and creates schema.
  - Otherwise uses SQLite at `LOCAL_DB_DIR`.

## Production Notes
- Place a reverse proxy (e.g., Nginx) in front if you need TLS.
- Regularly back up `app_data` volume (SQLite mode) or MySQL data volume.
- Change default credentials immediately after first login.

---
If you need a compose variant without MySQL entirely, remove the `mysql` service and `depends_on` from `docker-compose.yml` – the app will use SQLite only.