-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "org" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "description" TEXT,
    "repoUrl" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "spec" TEXT NOT NULL,
    "specVersion" INTEGER NOT NULL,
    "lifecycle" TEXT NOT NULL DEFAULT 'EXPERIMENTAL',
    "ownerTeam" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastSyncedAt" DATETIME,
    CONSTRAINT "Service_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceHealth" (
    "serviceId" TEXT NOT NULL PRIMARY KEY,
    "ciStatus" TEXT,
    "lastCommitAt" DATETIME,
    "lastCommitSha" TEXT,
    "openPrCount" INTEGER,
    "argoSyncStatus" TEXT,
    "argoHealth" TEXT,
    "openApiUrl" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceHealth_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProvisionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT,
    "org" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "spec" TEXT NOT NULL,
    "specHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stages" TEXT NOT NULL DEFAULT '[]',
    "mergeReport" TEXT,
    "warnings" TEXT NOT NULL DEFAULT '[]',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "repoUrl" TEXT,
    "requestedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    CONSTRAINT "ProvisionJob_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProvisionJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "spec" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Draft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "githubId" TEXT NOT NULL,
    "githubLogin" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME
);

-- CreateIndex
CREATE INDEX "Service_org_idx" ON "Service"("org");

-- CreateIndex
CREATE INDEX "Service_clientName_idx" ON "Service"("clientName");

-- CreateIndex
CREATE INDEX "Service_lifecycle_idx" ON "Service"("lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "Service_org_slug_key" ON "Service"("org", "slug");

-- CreateIndex
CREATE INDEX "ProvisionJob_status_idx" ON "ProvisionJob"("status");

-- CreateIndex
CREATE INDEX "ProvisionJob_org_slug_idx" ON "ProvisionJob"("org", "slug");

-- CreateIndex
CREATE INDEX "ProvisionJob_specHash_idx" ON "ProvisionJob"("specHash");

-- CreateIndex
CREATE INDEX "ProvisionJob_createdAt_idx" ON "ProvisionJob"("createdAt");

-- CreateIndex
CREATE INDEX "Draft_userId_updatedAt_idx" ON "Draft"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubLogin_key" ON "User"("githubLogin");
