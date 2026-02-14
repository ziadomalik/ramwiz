FROM richardluo831/ramulator2

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    nodejs \
    npm && \
    npm install -g pnpm && \
    rm -rf /var/lib/apt/lists/*

USER dev

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/home/dev/.cargo/bin:${PATH}"

ENV PNPM_HOME="/home/dev/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /home/dev/visualizer

CMD ["bash"]