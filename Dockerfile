# Build stage / 构建阶段
FROM golang:1.25-alpine AS builder

WORKDIR /build

# Copy server source preserving directory structure / 保持目录结构复制源码
COPY server/ ./

RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -o vr-paint-multi ./cmd/main.go

# Runtime stage / 运行阶段
FROM alpine:3.19

WORKDIR /app

# Copy binary / 复制可执行文件
COPY --from=builder /build/vr-paint-multi .

# Copy static files / 复制静态文件
COPY multi.html ./static/
COPY multiplayer/ ./static/multiplayer/
COPY boat-festival-game/ ./static/boat-festival-game/

# Optional static dirs (may not exist) / 可选静态目录（可能不存在）
# These are copied only if they exist in the repo
# 这些仅在仓库中存在时复制

# Render sets PORT env var automatically / Render 自动设置 PORT 环境变量
ENV STATIC_DIR=/app/static
EXPOSE 8081

CMD ["./vr-paint-multi"]
