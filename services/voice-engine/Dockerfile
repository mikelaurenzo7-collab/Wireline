FROM python:3.11-slim-bookworm@sha256:0a310eeecf4e1f5a0743f9a6520c90c88d089c903ca5fd283f501e3a805f5f89

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    TOKENIZERS_PARALLELISM=false \
    OMP_NUM_THREADS=4 \
    MKL_NUM_THREADS=4 \
    VOICE_ENGINE_HOST=0.0.0.0 \
    VOICE_ENGINE_MODEL_DIR=/models/chatterbox-nano \
    VOICE_ENGINE_CPU_THREADS=4 \
    PORT=8080

WORKDIR /app
COPY requirements.build.lock requirements.lock requirements.sources.lock ./
RUN python -m pip install --no-cache-dir --require-hashes -r requirements.build.lock \
    && python -m pip install --no-cache-dir --no-build-isolation --require-hashes \
       --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.lock \
    && python -m pip install --no-cache-dir --no-deps --no-build-isolation \
       --require-hashes -r requirements.sources.lock

COPY assets.py server.py prefetch.py THIRD_PARTY_NOTICES.md ./
RUN mkdir -p /models/chatterbox-nano && chown -R 10001:10001 /app /models
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz',timeout=3).read()"
CMD ["python", "server.py"]
