/*
  Warnings:

  - A unique constraint covering the columns `[parentProcessId,name]` on the table `ProcessInstance` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Resource_parentId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "ProcessInstance_parentProcessId_name_key" ON "ProcessInstance"("parentProcessId", "name");
