import fs from 'fs';
import path from 'path';
import latex from 'node-latex';
import { spawn } from 'child_process';

const OUTPUT_DIR = path.join(__dirname, '../../../ai-workspace/output');
const TEMPLATE_DIR = path.join(__dirname, '../../../data/resumes');

/**
 * Compile LaTeX to PDF
 */
async function compileLatexToPDF(texPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const texContent = fs.readFileSync(texPath, 'utf-8');
    const output = fs.createWriteStream(outputPath);

    // Specify MiKTeX path explicitly
    const pdf = latex(texContent, {
      cmd: 'C:/Users/athar/AppData/Local/Programs/MiKTeX/miktex/bin/x64/pdflatex.exe'
    });

    pdf.pipe(output);
    pdf.on('error', reject);
    pdf.on('finish', resolve);
  });
}

/**
 * Generate tailored resume LaTeX file
 */
export async function generateResumeLatex(
  jobId: number,
  jobTitle: string,
  companyName: string,
  description: string
): Promise<{ texPath: string; pdfPath: string }> {
  // Read template
  const templatePath = path.join(TEMPLATE_DIR, 'resume_ai.tex');
  if (!fs.existsSync(templatePath)) {
    throw new Error('LaTeX template not found: resume_ai.tex');
  }

  const template = fs.readFileSync(templatePath, 'utf-8');

  // For now, just copy template (AI will modify it later)
  // TODO: Use AI to tailor content
  const tailoredLatex = template;

  // Save tailored LaTeX
  const texPath = path.join(OUTPUT_DIR, `job_${jobId}_resume.tex`);
  fs.writeFileSync(texPath, tailoredLatex, 'utf-8');

  // Compile to PDF
  const pdfPath = path.join(OUTPUT_DIR, `job_${jobId}_resume.pdf`);
  await compileLatexToPDF(texPath, pdfPath);

  return { texPath, pdfPath };
}

/**
 * Generate cover letter LaTeX file
 */
export async function generateCoverLetterLatex(
  jobId: number,
  jobTitle: string,
  companyName: string,
  description: string
): Promise<{ texPath: string; pdfPath: string }> {
  // TODO: Implement cover letter template
  throw new Error('Cover letter LaTeX generation not yet implemented');
}

/**
 * Compile existing LaTeX file to PDF
 */
export async function compileTexFile(texPath: string): Promise<string> {
  const pdfPath = texPath.replace('.tex', '.pdf');
  await compileLatexToPDF(texPath, pdfPath);
  return pdfPath;
}
