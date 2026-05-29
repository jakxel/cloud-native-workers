# Project: JS Unit, Cloud Unit
Name: Islas Carreon Victor Jakxel
NoControl: 22211586
## CSV Processor — Distributed Cloud-Native with Docker Workers

A web application that processes CSV files using distributed workers, a Redis message queue, and a FastAPI backend. Tasks are tracked in real-time via Server-Sent Events (SSE).

## Architecture

```
Browser (HTML/JS)
      │
      │  POST /upload (fetch)
      ▼
  FastAPI (api)
      │  LPUSH csv_queue
      │  HSET task:{id} status=pending
      ▼
   Redis
      │
      ├──▶ worker_1  (BRPOP)
      ├──▶ worker_2  (BRPOP)
      └──▶ worker_3  (BRPOP)

Browser ◀── GET /stream/{id} (SSE) ── FastAPI ◀── HGET task:{id} ── Redis
```

## Quick Start (local)

```bash
git clone https://github.com/YOUR_USERNAME/csv-processor
cd csv-processor

# Start everything
docker compose up --build

# Open frontend
open http://localhost:80
```

## EC2 Deployment

```bash
# On your EC2 instance (Ubuntu 22.04):
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER && newgrp docker

git clone https://github.com/YOUR_USERNAME/csv-processor
cd csv-processor

# Optional: add AWS credentials for S3 signed uploads
cp .env.example .env
nano .env  # fill in AWS_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY

docker compose up -d --build

# Check logs
docker compose logs -f
```

Make sure EC2 Security Group allows inbound on ports **80** and **8000**.

## Environment Variables

Create a `.env` file (optional, for S3):

```env
AWS_BUCKET=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

## CSV Worker Tasks

Each worker computes per-CSV:

- **Total rows** — full row count
- **Valid rows** — rows with no missing values
- **Invalid rows** — rows with empty/null cells (with error messages)
- **Per numeric column** — count, total, average, min, max

## File Structure

```
csv-processor/
├── api/
│   ├── main.py          # FastAPI app (async, SSE, upload, presign)
│   ├── requirements.txt
│   └── Dockerfile
├── worker/
│   ├── worker.py        # CSV processor, Redis queue consumer
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   └── index.html       # Plain HTML + CSS + JS (no framework)
├── docker-compose.yml
└── README.md
```

## Frontend Features (Rubric Coverage)

| Rubric Item | Implementation |
|---|---|
| Event handlers | Upload button, drag events, clear history |
| fetch (own APIs) | `POST /upload`, `GET /status/{id}` |
| localStorage | Task history persisted across page reloads |
| DOM manipulation | Task cards, status badges, result tables injected dynamically |
| Animation | CSS spinner (processing), fadeIn (new cards), progress bar |
| S3 signed POST | `POST /s3-presign` in FastAPI → direct browser-to-S3 upload |
| Canvas | Bar chart of column averages drawn via Canvas API |
| Drag & Drop | Native HTML5 drag-and-drop on drop zone |

## Cloud Features (Rubric Coverage)

| Rubric Item | Implementation |
|---|---|
| EC2 + static IP | EC2 with Elastic IP, ports 80 + 8000 open |
| Docker workers | 3 named workers (worker_1, worker_2, worker_3) |
| Docker Compose | Full `docker-compose.yml` with healthchecks |
| Redis queue | LPUSH to enqueue, BRPOP to consume, HSET for status |
| FastAPI async | All routes are `async def`, uses `redis.asyncio` |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/upload` | Upload CSV, enqueue task |
| GET | `/status/{id}` | Get task status (JSON) |
| GET | `/stream/{id}` | SSE stream of task status |
| GET | `/tasks` | List all tasks |
| POST | `/s3-presign` | Generate S3 presigned POST URL |

## Task States

`pending` → `processing` → `completed` / `error`

## Tech Stack

- **Frontend**: Plain HTML, CSS, JavaScript (no framework)
- **Backend**: FastAPI (Python, async)
- **Queue**: Redis (list as queue, hash for task state)
- **Workers**: Python (3 containers)
- **Infrastructure**: Docker Compose, EC2, Elastic IP
