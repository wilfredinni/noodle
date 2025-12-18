FROM python:3-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install system dependencies
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        curl \
        build-essential \
        libpq-dev \
        git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy ONLY dependency files first (better caching - changes infrequently)
COPY pyproject.toml uv.lock ./

# Export and install dependencies from lock file (cached layer when deps don't change)
RUN uv export --no-hashes --all-extras --no-emit-project > requirements.txt && \
    uv pip install --system --no-cache -r requirements.txt

# Copy application code (changes frequently - separate layer)
COPY . .

EXPOSE 8000
