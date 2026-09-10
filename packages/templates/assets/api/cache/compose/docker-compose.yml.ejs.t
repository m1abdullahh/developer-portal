---
to: docker-compose.yml
---
# Local development dependencies.
#
# Emitted by the cache recipe because this project has no database: with one, the ORM recipe owns
# this file and the cache recipe adds its service to the region below instead.
services:
<%- redisService %>

  # Other local dependencies are added between these markers.
  # >>> idp:compose-services
  # <<< idp:compose-services
