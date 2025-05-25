# Clara Ollama Container Guide

Clara Ollama is now available as a container image. You can run it with either Podman (recommended) or Docker.

## Quick Start

### With Podman (Recommended)
```bash
podman pull claraverse/clara-ollama:latest
podman run -p 8069:8069 claraverse/clara-ollama:latest
```

### With Docker
```bash
docker pull claraverse/clara-ollama:latest
docker run -p 8069:8069 claraverse/clara-ollama:latest
```

Then open http://localhost:8069 in your browser.

## Why Podman?

Podman is recommended over Docker because:
- **Rootless**: Runs without requiring root privileges
- **Daemonless**: No background daemon required
- **Drop-in replacement**: Compatible with Docker commands
- **More secure**: Better isolation and security model
- **Systemd integration**: Better integration with system services

## For Developers

To build and publish with either container engine:

1. Set your registry username:
```bash
export DOCKER_USERNAME=your-username
```

2. Run the container-agnostic publish script:
```bash
yarn container:publish
```

Or use the legacy Docker-specific script:
```bash
yarn docker:publish
```

The container scripts will automatically detect and use Podman if available, falling back to Docker if not.

## Environment Variables

None required - Clara runs completely client-side!

## Port

The application runs on port 8069 by default.
