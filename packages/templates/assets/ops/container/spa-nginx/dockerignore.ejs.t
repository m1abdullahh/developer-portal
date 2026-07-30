---
to: .dockerignore
---
# Keeps build context small and prevents secrets reaching the daemon.
node_modules
dist
.vite
.turbo
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
