// @ts-ignore - no types available
import htmlPdf from 'html-pdf-node';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { marked } from 'marked';

const OUTPUT_DIR = path.join(os.tmpdir(), 'job-search-output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Converts markdown to ATS-friendly PDF using HTML rendering
 */
export async function markdownToPDF(
  markdownContent: string,
  outputPath: string,
  candidateName: string
): Promise<void> {
  // Convert markdown to HTML
  const htmlContent = await marked(markdownContent);

  // ATS-friendly HTML template with proper styling
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: letter;
      margin: 0.5in 0.7in;
    }

    body {
      font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.12;
      color: #000;
      margin: 0;
      padding: 0;
      font-variant-ligatures: none;
      -webkit-font-feature-settings: 'liga' 0;
      font-feature-settings: 'liga' 0;
    }

    /* Name header - BOLD, CENTERED */
    h1 {
      font-size: 14pt;
      font-weight: bold;
      margin: 0 0 2pt 0;
      padding: 0;
      color: #000;
      text-align: center;
      text-transform: uppercase;
    }

    /* Contact line below name - CENTERED */
    h1 + p {
      text-align: center;
      font-size: 10pt;
      margin: 0 0 6pt 0;
    }

    /* Section headers - UPPERCASE, bold, NO underline */
    h2 {
      font-size: 11pt;
      font-weight: bold;
      margin: 10pt 0 4pt 0;
      padding: 0;
      border: none;
      text-transform: uppercase;
      color: #000;
    }

    /* Company | Location */
    h3 {
      font-size: 10pt;
      font-weight: bold;
      margin: 4pt 0 1pt 0;
      color: #000;
    }

    /* Role title */
    h3 + p {
      margin: 0 0 2pt 0;
      font-style: italic;
    }

    h3 + p strong {
      font-weight: bold;
      font-style: italic;
    }

    p {
      margin: 0 0 1pt 0;
    }

    /* Bullet points */
    ul {
      margin: 2pt 0 4pt 0;
      padding-left: 20pt;
      list-style-type: disc;
    }

    li {
      margin-bottom: 1pt;
      line-height: 1.15;
      padding-left: 2pt;
    }

    hr {
      display: none;
    }

    strong {
      font-weight: bold;
    }

    a {
      color: #000;
      text-decoration: none;
    }

    hr {
      border: none;
      border-top: 1pt solid #ccc;
      margin: 6pt 0;
    }

    /* Ensure single column */
    * {
      max-width: 100%;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>
  `;

  const options: any = {
    format: 'Letter',
    printBackground: true,
    margin: {
      top: '0.5in',
      bottom: '0.5in',
      left: '0.75in',
      right: '0.75in'
    },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  };

  const file = { content: html };

  try {
    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    fs.writeFileSync(outputPath, pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    throw error;
  }
}

/**
 * Generate resume PDF from markdown
 */
export async function generateResumePDF(
  jobId: number,
  candidateName: string
): Promise<string> {
  const markdownPath = path.join(OUTPUT_DIR, `job_${jobId}_resume.md`);
  const pdfPath = path.join(OUTPUT_DIR, `job_${jobId}_resume.pdf`);

  if (!fs.existsSync(markdownPath)) {
    throw new Error('Resume markdown not found. Generate markdown first.');
  }

  const markdown = fs.readFileSync(markdownPath, 'utf-8');

  await markdownToPDF(markdown, pdfPath, candidateName);

  return pdfPath;
}

/**
 * Generate cover letter PDF from markdown
 */
export async function generateCoverLetterPDF(
  jobId: number,
  candidateName: string
): Promise<string> {
  const markdownPath = path.join(OUTPUT_DIR, `job_${jobId}_cover_letter.md`);
  const pdfPath = path.join(OUTPUT_DIR, `job_${jobId}_cover_letter.pdf`);

  if (!fs.existsSync(markdownPath)) {
    throw new Error('Cover letter markdown not found. Generate markdown first.');
  }

  const markdown = fs.readFileSync(markdownPath, 'utf-8');

  await markdownToPDF(markdown, pdfPath, candidateName);

  return pdfPath;
}
