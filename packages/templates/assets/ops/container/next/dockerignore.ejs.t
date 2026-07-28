---
to: .dockerignore
---
# Keeps build context small and prevents secrets reaching the daemon.
node_modules
.next
.turbo
dist
coverage

.env
.env.*
!.env.example
*.pem
*.key

.git
.github
*.md
!README.md
.vscode
.idea
Dockerfile
.dockerignore
