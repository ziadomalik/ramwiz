#!/bin/bash
# To be used in the Docker container to start the virtual desktop.

# Start virtual X11 screen
Xvfb :99 -screen 0 1280x800x24 &
export DISPLAY=:99

# Start window manager
fluxbox &

# Start VNC server (listening internally only)
x11vnc -display :99 -nopw -listen localhost -xkb -ncache 10 -ncache_cr -forever -bg

# Start websockify/noVNC to stream VNC over HTTP
websockify --web=/usr/share/novnc/ 8080 localhost:5900 &

echo "=================================================================="
echo " Web desktop running! Open http://localhost:8080/vnc.html "
echo "=================================================================="

exec "$@"