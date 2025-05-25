# Podman Setup Guide for ClaraVerse

This guide will help you set up Podman as a replacement for Docker Desktop to run ClaraVerse.

## Why Podman?

Podman offers several advantages over Docker Desktop:
- **Rootless**: Runs without requiring root privileges
- **Daemonless**: No background daemon required
- **Drop-in replacement**: Compatible with Docker commands
- **More secure**: Better isolation and security model
- **Free**: No licensing restrictions for commercial use
- **Systemd integration**: Better integration with system services

## Installation

### macOS

#### Option 1: Using Homebrew (Recommended)
```bash
brew install podman
```

#### Option 2: Using Podman Desktop
1. Download Podman Desktop from [podman-desktop.io](https://podman-desktop.io/)
2. Install the downloaded package
3. Launch Podman Desktop and follow the setup wizard

### Linux

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install podman
```

#### Fedora/RHEL/CentOS
```bash
sudo dnf install podman
```

#### Arch Linux
```bash
sudo pacman -S podman
```

### Windows

#### Option 1: Using Podman Desktop
1. Download Podman Desktop from [podman-desktop.io](https://podman-desktop.io/)
2. Install the downloaded package
3. Launch Podman Desktop and follow the setup wizard

#### Option 2: Using Chocolatey
```powershell
choco install podman-desktop
```

## Initial Setup

### macOS/Linux Setup

1. **Initialize Podman machine** (macOS only):
```bash
podman machine init
podman machine start
```

2. **Verify installation**:
```bash
podman --version
podman info
```

3. **Test with a simple container**:
```bash
podman run hello-world
```

### Windows Setup

1. **Launch Podman Desktop** and complete the initial setup
2. **Verify installation** in PowerShell:
```powershell
podman --version
podman info
```

## Configuration for ClaraVerse

### Enable Socket for Docker API Compatibility

ClaraVerse uses the Docker API, so we need to enable Podman's Docker-compatible socket:

#### macOS/Linux
```bash
# Enable and start the Podman socket
systemctl --user enable podman.socket
systemctl --user start podman.socket

# Or for macOS with Podman machine:
podman machine ssh
sudo systemctl enable podman.socket
sudo systemctl start podman.socket
exit
```

#### Alternative: Manual socket setup
```bash
# Create socket manually if systemd is not available
podman system service --time=0 unix:///tmp/podman.sock &
```

### Verify Socket is Working

```bash
# Test the socket
curl -H "Content-Type: application/json" \
  --unix-socket /run/user/$(id -u)/podman/podman.sock \
  http://localhost/version
```

## Running ClaraVerse with Podman

Once Podman is set up, ClaraVerse should automatically detect and use it instead of Docker Desktop. The application will:

1. **Auto-detect Podman sockets** in common locations
2. **Use Podman commands** when available
3. **Fall back to Docker** if Podman is not found

### Manual Verification

You can verify that ClaraVerse is using Podman by checking the logs in the application or by running:

```bash
# Check running containers
podman ps

# Check ClaraVerse containers specifically
podman ps --filter name=clara_
```

## Troubleshooting

### Common Issues

#### 1. Socket Permission Issues
```bash
# Fix socket permissions
sudo chmod 666 /run/user/$(id -u)/podman/podman.sock
```

#### 2. Machine Not Started (macOS)
```bash
# Start Podman machine
podman machine start
```

#### 3. Port Conflicts
```bash
# Check for port conflicts
podman port --all
```

#### 4. Container Registry Issues
```bash
# Login to container registry
podman login docker.io
```

### Getting Help

- **Podman Documentation**: [docs.podman.io](https://docs.podman.io/)
- **Podman GitHub**: [github.com/containers/podman](https://github.com/containers/podman)
- **ClaraVerse Issues**: [github.com/badboysm890/ClaraVerse/issues](https://github.com/badboysm890/ClaraVerse/issues)

## Migration from Docker Desktop

If you're migrating from Docker Desktop:

1. **Stop Docker Desktop**
2. **Install Podman** using the instructions above
3. **Import existing images** (optional):
```bash
# Export from Docker
docker save image_name:tag | podman load

# Or pull fresh images
podman pull image_name:tag
```
4. **Start ClaraVerse** - it should automatically detect Podman

## Performance Tips

- **Use Podman machine** on macOS for better performance
- **Enable cgroups v2** on Linux for better resource management
- **Use local storage** for better I/O performance
- **Allocate sufficient resources** to Podman machine (macOS/Windows)

## Security Benefits

Podman provides enhanced security through:
- **Rootless containers** by default
- **No daemon** running as root
- **User namespace isolation**
- **SELinux/AppArmor integration**
- **Seccomp profiles**

This makes Podman a more secure choice for running containerized applications like ClaraVerse.
