import PDFDocument from 'pdfkit'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle,
} from 'docx'

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40)
}

// ── PDF ───────────────────────────────────────────────────────────────────────

export function buildResumePdf(resumeText: string, candidateName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const lines = resumeText.split('\n')
    let first = true

    for (const raw of lines) {
      const line = raw.trimEnd()

      // Section header (ALL CAPS line, 3+ chars)
      if (line.length >= 3 && line === line.toUpperCase() && /^[A-Z\s&\/]+$/.test(line)) {
        if (!first) doc.moveDown(0.4)
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#111827')
          .text(line)
        doc.moveTo(50, doc.y + 2).lineTo(562, doc.y + 2).strokeColor('#d1d5db').stroke()
        doc.moveDown(0.3)
        first = false
        continue
      }

      // Candidate name at top (first non-empty line)
      if (first && line.trim()) {
        doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text(line, { align: 'center' })
        doc.moveDown(0.2)
        first = false
        continue
      }

      // Bullet line
      if (line.startsWith('- ')) {
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#374151')
          .text(`•  ${line.slice(2)}`, { indent: 12 })
        continue
      }

      // Job title / sub-heading line (contains " at " or date pattern)
      if (line && /\s+at\s+|\d{4}/.test(line) && !line.startsWith(' ')) {
        doc.moveDown(0.25)
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1f2937').text(line)
        continue
      }

      // Contact / plain line
      if (line.trim()) {
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#6b7280')
          .text(line, { align: line.includes('@') || line.includes('|') ? 'center' : 'left' })
      } else {
        doc.moveDown(0.3)
      }
    }

    doc.end()
  })
}

export function buildCoverLetterPdf(
  coverLetter: string,
  candidateName: string,
  jobTitle: string,
  company: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60, size: 'LETTER' })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Header
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text(candidateName)
    doc.moveDown(0.2)
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
    doc.moveDown(1)

    // Recipient
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text(`Hiring Manager`)
      .text(`${company}`)
    doc.moveDown(1)

    // Re line
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827')
      .text(`Re: ${jobTitle} Position`)
    doc.moveDown(0.8)

    // Body paragraphs
    const paragraphs = coverLetter.split(/\n\n+/).filter(p => p.trim())
    for (const para of paragraphs) {
      doc.font('Helvetica').fontSize(10).fillColor('#374151')
        .text(para.trim(), { lineGap: 3 })
      doc.moveDown(0.7)
    }

    // Closing
    doc.moveDown(0.5)
    doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Sincerely,')
    doc.moveDown(1.2)
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(candidateName)

    doc.end()
  })
}

// ── DOCX ──────────────────────────────────────────────────────────────────────

export async function buildResumeDocx(resumeText: string, candidateName: string): Promise<Buffer> {
  const lines = resumeText.split('\n')
  const children: Paragraph[] = []
  let first = true

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (first && line.trim()) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, bold: true, size: 36, color: '111827' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      }))
      first = false
      continue
    }

    if (line.length >= 3 && line === line.toUpperCase() && /^[A-Z\s&\/]+$/.test(line)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, bold: true, size: 20, color: '111827' })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'd1d5db' } },
      }))
      continue
    }

    if (line.startsWith('- ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line.slice(2), size: 19, color: '374151' })],
        bullet: { level: 0 },
        spacing: { after: 40 },
      }))
      continue
    }

    if (line && /\s+at\s+|\d{4}/.test(line) && !line.startsWith(' ')) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, bold: true, size: 19, color: '1f2937' })],
        spacing: { before: 120, after: 40 },
      }))
      continue
    }

    if (line.trim()) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, size: 19, color: '6b7280' })],
        alignment: line.includes('@') || line.includes('|') ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: 40 },
      }))
    } else {
      children.push(new Paragraph({ children: [], spacing: { after: 80 } }))
    }
  }

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}

export async function buildCoverLetterDocx(
  coverLetter: string,
  candidateName: string,
  jobTitle: string,
  company: string,
): Promise<Buffer> {
  const paragraphs = coverLetter.split(/\n\n+/).filter(p => p.trim())

  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: candidateName, bold: true, size: 28, color: '111827' })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [new TextRun({ text: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), size: 20, color: '6b7280' })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Hiring Manager', size: 20, color: '374151' })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: company, size: 20, color: '374151' })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Re: ${jobTitle} Position`, bold: true, size: 20, color: '111827' })],
      spacing: { after: 200 },
    }),
    ...paragraphs.map(para => new Paragraph({
      children: [new TextRun({ text: para.trim(), size: 20, color: '374151' })],
      spacing: { after: 160 },
    })),
    new Paragraph({ children: [new TextRun({ text: 'Sincerely,', size: 20, color: '374151' })], spacing: { before: 200, after: 320 } }),
    new Paragraph({ children: [new TextRun({ text: candidateName, bold: true, size: 20, color: '111827' })] }),
  ]

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBuffer(doc)
}
