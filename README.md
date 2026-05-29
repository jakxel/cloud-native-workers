# CSV Processor — Sistema Distribuido Cloud-Native para Procesamiento de CSV

## Video Explicación

https://youtu.be/q75pKnY6h5w

---

# Información del Alumno

| Campo | Valor |
|---|---|
| Nombre | Islas Carreon Victor Jakxel |
| Número de Control | 22211586 |

---

# Descripción del Proyecto

CSV Processor es una aplicación web distribuida y cloud-native que procesa archivos CSV de manera asíncrona utilizando workers en Docker, colas Redis y un backend desarrollado con FastAPI.

El sistema permite:

- Subir archivos CSV
- Procesar archivos de forma asíncrona
- Monitorear tareas en tiempo real
- Visualizar estadísticas del procesamiento
- Escalar workers horizontalmente
- Subir archivos directamente a AWS S3 mediante URLs firmadas

El frontend se comunica con el backend usando APIs REST y Server-Sent Events (SSE).

---

# Arquitectura

```text
Navegador (HTML/JS)
      │
      │  POST /upload (fetch)
      ▼
  FastAPI (api)
      │
      │  LPUSH csv_queue
      │  HSET task:{id} status=pending
      ▼
   Redis
      │
      ├──▶ worker_1 (BRPOP)
      ├──▶ worker_2 (BRPOP)
      └──▶ worker_3 (BRPOP)

Navegador ◀── GET /stream/{id} (SSE) ── FastAPI ◀── HGET task:{id} ── Redis
```

---

# Cómo Funciona

1. El usuario sube un archivo CSV desde el navegador
2. FastAPI almacena temporalmente el archivo
3. Se crea una tarea en Redis
4. La tarea se agrega a la cola `csv_queue`
5. Un worker disponible consume la tarea usando `BRPOP`
6. El worker procesa el archivo CSV
7. Los resultados se guardan nuevamente en Redis
8. El frontend recibe actualizaciones en tiempo real mediante SSE

---

# Características

## Funcionalidades del Frontend

- Subida de archivos mediante drag & drop
- Actualizaciones en tiempo real usando SSE
- Historial persistente usando `localStorage`
- Renderizado dinámico del DOM
- Gráficas estadísticas usando Canvas API
- Animaciones CSS y spinners de carga
- Subida directa a S3 usando URLs firmadas

---

## Funcionalidades del Backend

- API asíncrona con FastAPI
- Sistema de colas con Redis
- Workers distribuidos en Docker
- Streaming en tiempo real
- Validación y estadísticas de CSV
- Soporte para uploads firmados a AWS S3

---

# Tecnologías Utilizadas

| Capa | Tecnología |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | FastAPI (Python) |
| Cola | Redis |
| Workers | Python |
| Infraestructura | Docker Compose |
| Cloud | AWS EC2 + Elastic IP |
| Almacenamiento | AWS S3 |

---

# Uso de Redis

Redis se utiliza como:

- Cola distribuida de tareas:
  - `LPUSH csv_queue`
  - `BRPOP csv_queue`

- Base temporal para estado de tareas:
  - `HSET task:{id}`
  - `HGETALL task:{id}`

Esta arquitectura permite que múltiples workers procesen tareas concurrentemente.

---

# Actualizaciones en Tiempo Real (SSE)

El frontend escucha actualizaciones usando Server-Sent Events (SSE).

Endpoint:

```http
GET /stream/{task_id}
```

Esto permite recibir actualizaciones en vivo sin necesidad de hacer polling continuo.

---

# Escalabilidad

El sistema soporta escalamiento horizontal.

Es posible agregar más workers fácilmente incrementando el número de contenedores en Docker Compose.

Redis actúa como broker centralizado permitiendo que los workers consuman tareas de manera independiente y concurrente.

---

# Estructura del Proyecto

```text
csv-processor/
├── api/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── worker/
│   ├── worker.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   └── index.html
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

# Endpoints de la API

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/health` | Verificación del servicio |
| POST | `/upload` | Subir archivo CSV |
| GET | `/status/{id}` | Obtener estado de tarea |
| GET | `/stream/{id}` | Stream SSE en tiempo real |
| GET | `/tasks` | Listar tareas |
| POST | `/s3-presign` | Generar URL firmada para S3 |

---

# Ciclo de Vida de las Tareas

```text
pending → processing → completed / error
```

---

# Procesamiento de CSV

Cada worker calcula:

- Total de filas
- Filas válidas
- Filas inválidas
- Valores faltantes
- Estadísticas por columna:
  - conteo
  - suma
  - promedio
  - mínimo
  - máximo

---

# Inicio Rápido (Local)

## Clonar repositorio

```bash
git clone https://github.com/TU_USUARIO/csv-processor.git
cd csv-processor
```

---

## Iniciar contenedores

```bash
docker compose up --build
```

---

## Abrir aplicación

Abrir en el navegador:

```text
http://localhost
```

---

# Comandos Docker

## Iniciar servicios

```bash
docker compose up
```

---

## Reconstruir contenedores

```bash
docker compose up --build
```

---

## Ejecutar en background

```bash
docker compose up -d
```

---

## Detener servicios

```bash
docker compose down
```

---

## Ver logs

```bash
docker compose logs -f
```

---

# Despliegue en EC2

## Instalar Docker

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
```

---

## Habilitar permisos Docker

```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

## Clonar repositorio

```bash
git clone https://github.com/TU_USUARIO/csv-processor.git
cd csv-processor
```

---

## Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

---

## Iniciar aplicación

```bash
docker compose up -d --build
```

---

## Ver logs

```bash
docker compose logs -f
```

---

# Requisitos de EC2

El Security Group debe permitir:

| Puerto | Uso |
|---|---|
| 80 | Frontend |
| 8000 | API FastAPI |
| 22 | SSH |

---

# Variables de Entorno

Crear archivo `.env`:

```env
AWS_BUCKET=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY
```

---

# Uploads Firmados a AWS S3

El backend genera URLs firmadas temporales que permiten al navegador subir archivos directamente a S3 sin pasar por FastAPI.

Endpoint:

```http
POST /s3-presign
```

---

# Notas de Seguridad

⚠️ Nunca subir credenciales reales de AWS a GitHub.

Métodos recomendados en producción:

- AWS IAM Roles
- AWS Secrets Manager
- Variables de entorno

---

# Cobertura de la Rúbrica Frontend

| Elemento | Implementación |
|---|---|
| Event handlers | Botón upload, drag events |
| Fetch APIs | `/upload`, `/status`, `/stream` |
| localStorage | Persistencia de historial |
| DOM manipulation | Cards dinámicas |
| CSS animations | Spinners y transiciones |
| Canvas API | Gráficas estadísticas |
| Drag & Drop | HTML5 nativo |
| SSE | Actualizaciones en tiempo real |
| S3 Upload | Presigned POST |

---

# Cobertura de la Rúbrica Cloud

| Elemento | Implementación |
|---|---|
| EC2 Deployment | AWS EC2 Ubuntu |
| Elastic IP | Acceso público estático |
| Docker Compose | Arquitectura multi-contenedor |
| Redis Queue | Cola distribuida |
| Distributed Workers | 3 workers independientes |
| Async Backend | FastAPI async |
| Real-Time Communication | SSE |
| Cloud Storage | AWS S3 |

---

# Troubleshooting

## Error de permisos Docker

```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

## Problemas con Redis

```bash
docker compose logs redis
```

---

## Reconstruir todo

```bash
docker compose down
docker compose up --build
```

---

## Ver contenedores activos

```bash
docker ps
```

---

# Mejoras Futuras

- Sistema de autenticación
- Tracking de porcentaje de progreso
- Despliegue en Kubernetes
- Base de datos PostgreSQL persistente
- Preview del CSV antes de procesar
- Soporte WebSockets
- Autoescalado de workers

---

# Screenshots

## Interfaz de Upload

_Agregar screenshot aquí_

---

## Resultados del Procesamiento

_Agregar screenshot aquí_

---

# Conclusión

Este proyecto demuestra una arquitectura distribuida cloud-native utilizando:

- FastAPI
- Redis
- Docker Compose
- Workers distribuidos
- AWS EC2
- AWS S3
- Comunicación en tiempo real mediante SSE

El sistema es escalable, asíncrono y construido utilizando principios modernos de arquitectura cloud-native.
