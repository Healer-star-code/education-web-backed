import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

const MAX_EXTRACTED_CHARS = 60000
const MAX_WORKSHEET_CHARS = 12000

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function textFromXml(xml: string): string {
  const chunks = [...xml.matchAll(/<(?:a|w):t[^>]*>([\s\S]*?)<\/(?:a|w):t>/g)]
    .map((match) => decodeXml(match[1].replace(/<[^>]+>/g, '')))
    .filter(Boolean)
  return normalizeText(chunks.join('\n'))
}

async function extractDocx(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath })
  return normalizeText(result.value)
}

async function extractPptx(filePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await readFile(filePath))
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const notesFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const parts: string[] = []
  for (const name of slideFiles) {
    const xml = await zip.files[name].async('string')
    const text = textFromXml(xml)
    if (text) parts.push(`【${name.replace(/^ppt\/slides\//i, '').replace(/\.xml$/i, '')}】\n${text}`)
  }
  for (const name of notesFiles) {
    const xml = await zip.files[name].async('string')
    const text = textFromXml(xml)
    if (text) parts.push(`【${name.replace(/^ppt\/notesSlides\//i, '').replace(/\.xml$/i, '')} 备注】\n${text}`)
  }
  return normalizeText(parts.join('\n\n'))
}

function extractSpreadsheet(filePath: string): string {
  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const parts: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    const clipped = csv.length > MAX_WORKSHEET_CHARS ? `${csv.slice(0, MAX_WORKSHEET_CHARS)}\n...（该工作表内容过长，已截断）` : csv
    parts.push(`【工作表：${sheetName}】\n${clipped}`)
  }
  return normalizeText(parts.join('\n\n'))
}

async function extractPdf(filePath: string): Promise<string> {
  const pdfParseModule = await import('pdf-parse') as { default?: (buffer: Buffer) => Promise<{ text?: string }> }
  const pdfParse = pdfParseModule.default
  if (!pdfParse) return ''
  const result = await pdfParse(await readFile(filePath))
  return normalizeText(result.text ?? '')
}

async function extractPlainText(filePath: string): Promise<string> {
  return normalizeText(await readFile(filePath, 'utf8'))
}

export async function extractTextFromFile(filePath: string, mimeType = ''): Promise<string> {
  const ext = extname(filePath).toLowerCase()
  let text = ''
  if (ext === '.docx' || mimeType.includes('wordprocessingml')) {
    text = await extractDocx(filePath)
  } else if (ext === '.pptx' || mimeType.includes('presentationml')) {
    text = await extractPptx(filePath)
  } else if (['.xlsx', '.xlsm', '.xls', '.csv', '.tsv'].includes(ext) || mimeType.includes('spreadsheetml')) {
    text = ext === '.csv' || ext === '.tsv' ? await extractPlainText(filePath) : extractSpreadsheet(filePath)
  } else if (ext === '.pdf' || mimeType === 'application/pdf') {
    text = await extractPdf(filePath)
  } else if (['.txt', '.md', '.json', '.csv', '.tsv', '.log'].includes(ext) || mimeType.startsWith('text/')) {
    text = await extractPlainText(filePath)
  }
  return text.length > MAX_EXTRACTED_CHARS ? `${text.slice(0, MAX_EXTRACTED_CHARS)}\n...（文件内容过长，已截断）` : text
}
