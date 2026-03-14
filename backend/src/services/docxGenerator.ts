import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType } from 'docx';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.join(__dirname, '../../../ai-workspace/output');

/**
 * Converts markdown resume to DOCX format (ATS-friendly)
 */
export async function markdownToDocx(
  markdownContent: string,
  outputPath: string,
  candidateName: string
): Promise<void> {
  const lines = markdownContent.split('\n');
  const paragraphs: Paragraph[] = [];

  let inBulletList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and HR
    if (!line || line === '---') {
      if (inBulletList) inBulletList = false;
      continue;
    }

    // H1 - Name
    if (line.startsWith('# ')) {
      const text = line.substring(2);
      paragraphs.push(
        new Paragraph({
          text,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 }
        })
      );
    }
    // H2 - Section headers
    else if (line.startsWith('## ')) {
      const text = line.substring(3);
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text,
              bold: true,
              size: 22,
              allCaps: true,
              underline: { type: UnderlineType.SINGLE }
            })
          ],
          spacing: { before: 200, after: 100 }
        })
      );
    }
    // H3 - Company/Role headers
    else if (line.startsWith('### ')) {
      const text = line.substring(4);
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text, bold: true, size: 22 })],
          spacing: { before: 120, after: 60 }
        })
      );
    }
    // Bold text (**text**)
    else if (line.includes('**')) {
      const parts = line.split('**');
      const runs: TextRun[] = [];

      for (let j = 0; j < parts.length; j++) {
        if (parts[j]) {
          runs.push(
            new TextRun({
              text: parts[j],
              bold: j % 2 === 1,
              size: 22
            })
          );
        }
      }

      paragraphs.push(
        new Paragraph({
          children: runs,
          spacing: { after: 60 }
        })
      );
    }
    // Bullet points
    else if (line.startsWith('- ')) {
      const text = line.substring(2);
      paragraphs.push(
        new Paragraph({
          text,
          bullet: { level: 0 },
          spacing: { after: 40 }
        })
      );
      inBulletList = true;
    }
    // Normal text
    else {
      paragraphs.push(
        new Paragraph({
          text: line,
          spacing: { after: 60 }
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 1080,
              right: 1080
            }
          }
        },
        children: paragraphs
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

/**
 * Generate resume DOCX from markdown
 */
export async function generateResumeDocx(
  jobId: number,
  candidateName: string
): Promise<string> {
  const markdownPath = path.join(OUTPUT_DIR, `job_${jobId}_resume.md`);
  const docxPath = path.join(OUTPUT_DIR, `job_${jobId}_resume.docx`);

  if (!fs.existsSync(markdownPath)) {
    throw new Error('Resume markdown not found. Generate markdown first.');
  }

  const markdown = fs.readFileSync(markdownPath, 'utf-8');

  await markdownToDocx(markdown, docxPath, candidateName);

  return docxPath;
}

/**
 * Generate cover letter DOCX from markdown
 */
export async function generateCoverLetterDocx(
  jobId: number,
  candidateName: string
): Promise<string> {
  const markdownPath = path.join(OUTPUT_DIR, `job_${jobId}_cover_letter.md`);
  const docxPath = path.join(OUTPUT_DIR, `job_${jobId}_cover_letter.docx`);

  if (!fs.existsSync(markdownPath)) {
    throw new Error('Cover letter markdown not found. Generate markdown first.');
  }

  const markdown = fs.readFileSync(markdownPath, 'utf-8');

  await markdownToDocx(markdown, docxPath, candidateName);

  return docxPath;
}
