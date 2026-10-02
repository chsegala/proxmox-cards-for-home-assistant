# Security

Security issues include unauthorized service dispatch, cross-device discovery/override access, unsafe navigation or script execution, credential exposure, and permission bypasses. Ordinary rendering defects belong in bug reports.

The card uses the existing HA session/integration and must never require additional credentials. It does not directly receive or store Proxmox credentials. Permissions are enforced by Home Assistant; the card is not a replacement for HA authorization.

Do not disclose vulnerabilities publicly before coordinating with the maintainer. Include the affected version/commit, HA/browser versions, reproduction steps and potential impact. Share only sanitized data; never send tokens, passwords, session cookies or private keys.

Do not file vulnerability details in public issues. Ask the maintainer for a private reporting channel before sharing sensitive details.

This project is in development and has no supported-release security maintenance policy yet. Repository review is not a penetration test or a guarantee that the software is vulnerability-free.
