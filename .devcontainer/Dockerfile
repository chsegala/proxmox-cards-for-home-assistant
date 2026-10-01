FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# Override to match the Kubernetes server's supported kubectl version skew.
ARG KUBECTL_VERSION=v1.35.0
USER root
RUN set -eu; \
    arch="$(dpkg --print-architecture)"; \
    curl --fail --silent --show-error --location "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${arch}/kubectl" -o /tmp/kubectl; \
    curl --fail --silent --show-error --location "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${arch}/kubectl.sha256" -o /tmp/kubectl.sha256; \
    cd /tmp; \
    printf '%s  kubectl\n' "$(cat kubectl.sha256)" | sha256sum --check; \
    install -m 0755 kubectl /usr/local/bin/kubectl; \
    rm kubectl kubectl.sha256
USER node
