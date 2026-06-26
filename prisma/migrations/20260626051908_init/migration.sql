-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromptProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "useCase" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "welcomeMessage" TEXT NOT NULL,
    "agentPrompt" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "blueprintJson" TEXT NOT NULL,
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "completionScore" INTEGER NOT NULL DEFAULT 0,
    "safetyScore" INTEGER NOT NULL DEFAULT 0,
    "voiceStyleScore" INTEGER NOT NULL DEFAULT 0,
    "structureScore" INTEGER NOT NULL DEFAULT 0,
    "edgeCaseScore" INTEGER NOT NULL DEFAULT 0,
    "humanQualityScore" INTEGER NOT NULL DEFAULT 0,
    "hallucinationResistanceScore" INTEGER NOT NULL DEFAULT 0,
    "minimumManualEditScore" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromptProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BuilderSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "selectedTemplate" TEXT NOT NULL DEFAULT '',
    "useCase" TEXT NOT NULL DEFAULT '',
    "industry" TEXT NOT NULL DEFAULT '',
    "businessSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "missionJson" TEXT NOT NULL DEFAULT '{}',
    "conversationDesignJson" TEXT NOT NULL DEFAULT '{}',
    "personalityJson" TEXT NOT NULL DEFAULT '{}',
    "gapAuditJson" TEXT NOT NULL DEFAULT '{}',
    "followupAnswersJson" TEXT NOT NULL DEFAULT '{}',
    "refinedBlueprintJson" TEXT NOT NULL DEFAULT '{}',
    "generatedProjectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BuilderSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DynamicVariable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'business',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "defaultValue" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'static',
    "description" TEXT NOT NULL DEFAULT '',
    "usedInSections" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DynamicVariable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SuggestedFunction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "purposeInPrompt" TEXT NOT NULL,
    "requiredInputsJson" TEXT NOT NULL DEFAULT '[]',
    "expectedOutputsJson" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SuggestedFunction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeBaseNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeBaseNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "agentPrompt" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "blueprintJson" TEXT NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromptVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "callerGoal" TEXT NOT NULL,
    "sampleCallerMessage" TEXT NOT NULL,
    "expectedAgentBehavior" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromptQualityIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromptQualityIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PromptProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
