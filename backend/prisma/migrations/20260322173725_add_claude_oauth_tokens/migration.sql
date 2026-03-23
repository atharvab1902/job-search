-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "claude_access_token" TEXT,
ADD COLUMN     "claude_refresh_token" TEXT,
ADD COLUMN     "claude_token_expiry" BIGINT,
ADD COLUMN     "gemini_api_key" TEXT;
