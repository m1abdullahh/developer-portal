---
to: prisma/schema.prisma
---
// Prisma schema for <%= spec.meta.projectName %>.
//
// Prisma 7 removed `url` from the datasource block: the connection string lives in
// prisma.config.ts for CLI commands, and is supplied to PrismaClient through a driver
// adapter at runtime (see src/lib/prisma.ts).

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

/// Example model. Replace it with your domain.
model Example {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([createdAt])
}

// Models contributed by page modules land between these markers. Anything you write outside them
// is yours and is never rewritten; regenerating only replaces the region in between.
// >>> idp:models
// <<< idp:models
