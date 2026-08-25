-- Rollback: ALTER TABLE "workspace_roles" DROP COLUMN "permission_overrides";
ALTER TABLE "workspace_roles" ADD COLUMN "permission_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;
