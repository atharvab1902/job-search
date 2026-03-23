-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "gemini_access_token" TEXT,
ADD COLUMN     "gemini_refresh_token" TEXT,
ADD COLUMN     "gemini_token_expiry" BIGINT;
