import os
import json
import time
import csv
import socket
import statistics
import redis

import sys
sys.stdout.flush()

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
WORKER_ID = os.getenv("WORKER_ID", socket.gethostname())

r = redis.from_url(REDIS_URL, decode_responses=True)


def process_csv(file_path: str) -> dict:
    rows = []
    errors = []

    with open(file_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []

        for i, row in enumerate(reader, start=2):
            has_error = False
            for k, v in row.items():
                if v is None or v.strip() == "":
                    errors.append(f"Row {i}: missing value in column '{k}'")
                    has_error = True
            if not has_error:
                rows.append(row)

    if not rows:
        return {
            "total_rows": 0,
            "valid_rows": 0,
            "invalid_rows": len(errors),
            "errors": errors[:10],
            "columns": {},
        }

    numeric_cols = {}
    for col in headers:
        values = []
        for row in rows:
            try:
                values.append(float(row[col]))
            except (ValueError, TypeError):
                pass
        if values:
            numeric_cols[col] = {
                "count": len(values),
                "total": round(sum(values), 4),
                "average": round(statistics.mean(values), 4),
                "min": round(min(values), 4),
                "max": round(max(values), 4),
            }

    return {
        "total_rows": len(rows) + len(errors),
        "valid_rows": len(rows),
        "invalid_rows": len(errors),
        "errors": errors[:10],
        "columns": numeric_cols,
        "headers": headers,
    }


def run():
    print(f"[{WORKER_ID}] Worker started, waiting for tasks...")

    while True:
        try:
            item = r.brpop("csv_queue", timeout=5)
            if item is None:
                continue

            _, raw = item
            task_data = json.loads(raw)
            task_id = task_data["task_id"]
            file_path = task_data["file_path"]

            print(f"[{WORKER_ID}] Processing task {task_id} — {file_path}")

            r.hset(f"task:{task_id}", mapping={
                "status": "processing",
                "worker_id": WORKER_ID,
            })

            time.sleep(6)  

            result = process_csv(file_path)

            r.hset(f"task:{task_id}", mapping={
                "status": "completed",
                "result": json.dumps(result),
                "worker_id": WORKER_ID,
            })

            print(f"[{WORKER_ID}] Task {task_id} completed. "
                  f"{result['valid_rows']} valid rows, "
                  f"{result['invalid_rows']} invalid.")

        except FileNotFoundError as e:
            print(f"[{WORKER_ID}] File not found: {e}")
            if "task_id" in locals():
                r.hset(f"task:{task_id}", mapping={
                    "status": "error",
                    "error": str(e),
                    "worker_id": WORKER_ID,
                })
        except Exception as e:
            print(f"[{WORKER_ID}] Unexpected error: {e}")
            if "task_id" in locals():
                r.hset(f"task:{task_id}", mapping={
                    "status": "error",
                    "error": str(e),
                    "worker_id": WORKER_ID
                })


if __name__ == "__main__":
    run()
