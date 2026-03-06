FROM codercom/code-server:latest

USER root

# System dependencies.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    nodejs npm \
    curl gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install gcloud CLI.
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.asc] \
    https://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list \
    && curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | gpg --dearmor -o /usr/share/keyrings/cloud.google.asc \
    && apt-get update \
    && apt-get install -y google-cloud-cli \
    && rm -rf /var/lib/apt/lists/*

# Install EE Python package.
RUN pip3 install --break-system-packages earthengine-api

# Switch to coder user.
USER coder

# Copy and build the extension.
COPY --chown=coder:coder . /home/coder/eede
WORKDIR /home/coder/eede
RUN npm install && npm run compile

# Install extension into code-server.
RUN mkdir -p /home/coder/.local/share/code-server/extensions/eede \
    && cp -r out package.json node_modules \
    /home/coder/.local/share/code-server/extensions/eede/

# Set up default workspace with example notebook.
RUN mkdir -p /home/coder/workspace
COPY --chown=coder:coder examples/ /home/coder/workspace/examples/

# code-server config.
RUN mkdir -p /home/coder/.config/code-server \
    && echo 'bind-addr: 0.0.0.0:8080\nauth: none\ncert: false' \
    > /home/coder/.config/code-server/config.yaml

EXPOSE 8080

ENTRYPOINT ["code-server", "--disable-telemetry", "/home/coder/workspace"]
