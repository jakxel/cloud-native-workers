import uuid
import os
import json
import asyncio
import csv
import io

import boto3
from botocore.exceptions import ClientError
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from redis import asyncio as aioredis

app = FastAPI(title="CSV Processor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
UPLOAD_DIR = "/shared/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

AWS_BUCKET = os.getenv("AWS_BUCKET", "")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


async def get_redis():
    return await aioredis.from_url(REDIS_URL, decode_responses=True)


@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "Only CSV files are accepted")

    task_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{task_id}.csv")

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    try:
        r = await get_redis()
        task = {
            "task_id": task_id,
            "filename": file.filename,
            "file_path": file_path,
            "status": "pending",
            "result": "",
            "worker_id": "",
            "error": "",
        }
        await r.hset(f"task:{task_id}", mapping=task)
        await r.lpush("csv_queue", json.dumps({"task_id": task_id, "file_path": file_path}))
        await r.close()
        print(f"Task {task_id} enqueued successfully")
    except Exception as e:
        print(f"REDIS ERROR: {e}")
        raise HTTPException(500, f"Redis error: {str(e)}")

    return {"task_id": task_id, "filename": file.filename}

@app.get("/status/{task_id}")
async def get_status(task_id: str):
    r = await get_redis()
    task = await r.hgetall(f"task:{task_id}")
    await r.close()
    if not task:
        raise HTTPException(404, "Task not found")
    if task.get("result"):
        task["result"] = json.loads(task["result"])
    return task


@app.get("/stream/{task_id}")
async def stream_status(task_id: str):
    async def event_generator():
        r = await get_redis()
        try:
            while True:
                task = await r.hgetall(f"task:{task_id}")
                if not task:
                    yield f"data: {json.dumps({'error': 'Task not found'})}\n\n"
                    break

                payload = {
                    "task_id": task_id,
                    "status": task.get("status"),
                    "worker_id": task.get("worker_id"),
                    "filename": task.get("filename"),
                }
                if task.get("result"):
                    payload["result"] = json.loads(task["result"])
                if task.get("error"):
                    payload["error"] = task["error"]

                yield f"data: {json.dumps(payload)}\n\n"

                if task.get("status") in ("completed", "error"):
                    break

                await asyncio.sleep(0.5)
        finally:
            await r.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/tasks")
async def list_tasks():
    r = await get_redis()
    keys = await r.keys("task:*")
    tasks = []
    for key in keys:
        t = await r.hgetall(key)
        if t:
            tasks.append({
                "task_id": t.get("task_id"),
                "filename": t.get("filename"),
                "status": t.get("status"),
                "worker_id": t.get("worker_id"),
            })
    await r.close()
    return tasks


@app.post("/s3-presign")
async def presign_upload(filename: str, content_type: str = "text/csv"):
    if not AWS_BUCKET:
        raise HTTPException(501, "S3 not configured")
    s3 = boto3.client("s3", region_name=AWS_REGION)
    key = f"uploads/{uuid.uuid4()}/{filename}"
    try:
        resp = s3.generate_presigned_post(
            AWS_BUCKET,
            key,
            Fields={"Content-Type": content_type},
            Conditions=[{"Content-Type": content_type}],
            ExpiresIn=300,
        )
        return {"url": resp["url"], "fields": resp["fields"], "key": key}
    except ClientError as e:
        raise HTTPException(500, str(e))
