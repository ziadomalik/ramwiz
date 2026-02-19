FROM richardluo831/ramulator2:latest

USER root

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  # Virtual Display, Window Manager, and VNC Server.
  xvfb \
  x11vnc \
  novnc \
  websockify \
  fluxbox \
  xterm \

  libwebkit2gtk-4.1-dev \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \

  nodejs \
  npm \
  && npm install -g bun \
  && rm -rf /var/lib/apt/lists/*

USER dev
WORKDIR /home/dev

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/home/dev/.cargo/bin:${PATH}"

COPY start-virtual-desktop.sh start-virtual-desktop.sh
RUN chmod +x start-virtual-desktop.sh

EXPOSE 8080

ENTRYPOINT ["/home/dev/start-virtual-desktop.sh"]
CMD ["/bin/bash"]