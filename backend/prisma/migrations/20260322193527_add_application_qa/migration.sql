-- CreateTable
CREATE TABLE "ApplicationQA" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "job_id" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationQA_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ApplicationQA" ADD CONSTRAINT "ApplicationQA_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationQA" ADD CONSTRAINT "ApplicationQA_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
