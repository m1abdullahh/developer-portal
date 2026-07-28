---
to: .dockerignore
---
# Keeps build context small and prevents secrets reaching the daemon.
node_modules
dist
.next
.turbo
coverage

# Never send these to the build context — a COPY . . would bake them into a layer that
# persists even if a later stage deletes the file.
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
**/*.test.ts
**/*.spec.ts
