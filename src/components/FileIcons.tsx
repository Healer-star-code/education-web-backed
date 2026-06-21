interface IconProps {
  size?: number
}

const DIM = 'var(--text-dim)'
const WORD = 'var(--accent)'
const PPT = '#ea580c'
const EXCEL = '#16a34a'
const PDF = '#dc2626'
const IMAGE = '#8b5cf6'
const ARCHIVE = '#a16207'
const AUDIO = '#0891b2'
const VIDEO = '#be185d'

export function FolderIcon({ size = 14, open = false }: IconProps & { open?: boolean }) {
  if (open) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <path d="M1 4.5A1 1 0 0 1 2 3.5H5.5L7 5h7.5v1H1V4.5Z" fill={DIM} />
        <path d="M1 6h14.5L14 13H2L1 6Z" stroke={DIM} strokeWidth="1" fill={DIM} fillOpacity="0.12" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M1 4.5A1 1 0 0 1 2 3.5H5.5L7 5H14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4.5Z"
        stroke={DIM} strokeWidth="1" fill={DIM} fillOpacity="0.1" />
    </svg>
  )
}

export function GenericFileIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3 2h7l3 3v9H3V2Z" stroke={DIM} strokeWidth="1" fill={DIM} fillOpacity="0.08" />
      <path d="M10 2v3h3" stroke={DIM} strokeWidth="1" fill="none" strokeLinejoin="round" />
    </svg>
  )
}

function LabelFileIcon({ label, size = 14 }: { label: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1h6l3 3v9h-9V1Z" stroke={DIM} strokeWidth="0.9" fill={DIM} fillOpacity="0.07" strokeLinejoin="round" />
      <path d="M8.5 1v3h3" stroke={DIM} strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      <text x="7" y="9.5" textAnchor="middle" fontSize="3.4" fontFamily="var(--font-mono), monospace" fontWeight="600" fill={DIM}>{label}</text>
    </svg>
  )
}

function TypeScriptIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="TS" size={size} /> }
function TypeScriptReactIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="TSX" size={size} /> }
function JavaScriptIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="JS" size={size} /> }
function JavaScriptReactIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="JSX" size={size} /> }
function PythonIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="PY" size={size} /> }
function JsonIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="{}" size={size} /> }
function CssIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="CSS" size={size} /> }
function ScssIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="SC" size={size} /> }
function HtmlIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="HTM" size={size} /> }
function YamlIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="YML" size={size} /> }
function TomlIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="TOM" size={size} /> }
function RustIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="RS" size={size} /> }
function GoIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="GO" size={size} /> }
function SqlIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="SQL" size={size} /> }
function GraphqlIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="GQL" size={size} /> }
function TerraformIcon({ size = 14 }: IconProps) { return <LabelFileIcon label="TF" size={size} /> }
function OfficeIcon({ label, color, size = 14 }: { label: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M4 1.5h7l3 3V16H4V1.5Z" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M11 1.5v3h3" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="1.8" y="6" width="9" height="8.5" rx="1.4" fill={color} />
      <text x="6.3" y="12" textAnchor="middle" fontSize="5.2" fontFamily="Arial, sans-serif" fontWeight="800" fill="#fff">{label}</text>
    </svg>
  )
}

function WordFileIcon({ size = 14 }: IconProps) { return <OfficeIcon label="W" color={WORD} size={size} /> }
function PptFileIcon({ size = 14 }: IconProps) { return <OfficeIcon label="P" color={PPT} size={size} /> }
function ExcelFileIcon({ size = 14 }: IconProps) { return <OfficeIcon label="X" color={EXCEL} size={size} /> }
function PdfFileIcon({ size = 14 }: IconProps) { return <OfficeIcon label="PDF" color={PDF} size={size} /> }

function ImageFileIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M4 1.5h7l3 3V16H4V1.5Z" fill={IMAGE} fillOpacity="0.12" stroke={IMAGE} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M11 1.5v3h3" stroke={IMAGE} strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="5.2" y="8" width="6.8" height="5.5" rx="0.8" fill={IMAGE} />
      <circle cx="7.2" cy="10" r="0.7" fill="#fff" />
      <path d="M5.6 13l1.6-1.8 1.4 1.2 1.5-2.2 1.8 2.8" stroke="#fff" strokeWidth="0.7" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function ArchiveFileIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M4 1.5h7l3 3V16H4V1.5Z" fill={ARCHIVE} fillOpacity="0.12" stroke={ARCHIVE} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M11 1.5v3h3" stroke={ARCHIVE} strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="7.4" y="2" width="1.4" height="1.4" fill={ARCHIVE} />
      <rect x="9" y="3.4" width="1.4" height="1.4" fill={ARCHIVE} />
      <rect x="7.4" y="4.8" width="1.4" height="1.4" fill={ARCHIVE} />
      <rect x="9" y="6.2" width="1.4" height="1.4" fill={ARCHIVE} />
      <rect x="7.4" y="7.6" width="1.4" height="1.4" fill={ARCHIVE} />
      <rect x="6.4" y="10.5" width="5" height="3.8" rx="0.6" fill={ARCHIVE} />
      <rect x="8.4" y="11.6" width="1" height="1.6" fill="#fff" />
    </svg>
  )
}

function AudioFileIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M4 1.5h7l3 3V16H4V1.5Z" fill={AUDIO} fillOpacity="0.12" stroke={AUDIO} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M11 1.5v3h3" stroke={AUDIO} strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="7.5" cy="12" r="1.4" fill={AUDIO} />
      <path d="M8.9 12V7l3 0.8V12" stroke={AUDIO} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="10.5" cy="12" r="1.2" fill={AUDIO} />
    </svg>
  )
}

function VideoFileIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M4 1.5h7l3 3V16H4V1.5Z" fill={VIDEO} fillOpacity="0.12" stroke={VIDEO} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M11 1.5v3h3" stroke={VIDEO} strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="5.2" y="8" width="7.6" height="5.5" rx="0.8" fill={VIDEO} />
      <path d="M7.6 9.6v2.8L10.5 11l-2.9-1.4Z" fill="#fff" />
    </svg>
  )
}

function SvgFileIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M4 1.5h7l3 3V16H4V1.5Z" fill={IMAGE} fillOpacity="0.12" stroke={IMAGE} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M11 1.5v3h3" stroke={IMAGE} strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="2.4" y="9" width="9.5" height="5" rx="0.8" fill={IMAGE} />
      <text x="7.15" y="13" textAnchor="middle" fontSize="3.6" fontFamily="Arial, sans-serif" fontWeight="800" fill="#fff">SVG</text>
    </svg>
  )
}

function TextFileIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1h6l3 3v9h-9V1Z" stroke={DIM} strokeWidth="0.9" fill={DIM} fillOpacity="0.07" strokeLinejoin="round" />
      <path d="M8.5 1v3h3" stroke={DIM} strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      <path d="M4 6.5h6M4 8.5h6M4 10.5h4" stroke={DIM} strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  )
}

function MarkdownIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1h6l3 3v9h-9V1Z" stroke={DIM} strokeWidth="0.9" fill={DIM} fillOpacity="0.07" strokeLinejoin="round" />
      <path d="M8.5 1v3h3" stroke={DIM} strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      <path d="M3.5 9.5V7l1.5 1.5L6.5 7v2.5" stroke={DIM} strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M8 7v2.5M7 9l1 1.5 1-1.5" stroke={DIM} strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function ShellIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1h6l3 3v9h-9V1Z" stroke={DIM} strokeWidth="0.9" fill={DIM} fillOpacity="0.07" strokeLinejoin="round" />
      <path d="M8.5 1v3h3" stroke={DIM} strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      <path d="M4 7.5l2 1.5-2 1.5" stroke={DIM} strokeWidth="0.95" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M7.5 10.5h2.5" stroke={DIM} strokeWidth="0.95" strokeLinecap="round" />
    </svg>
  )
}

function DockerfileIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1h6l3 3v9h-9V1Z" stroke={DIM} strokeWidth="0.9" fill={DIM} fillOpacity="0.07" strokeLinejoin="round" />
      <path d="M8.5 1v3h3" stroke={DIM} strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      <rect x="3.5" y="6.5" width="2" height="1.5" rx="0.3" stroke={DIM} strokeWidth="0.8" />
      <rect x="6" y="6.5" width="2" height="1.5" rx="0.3" stroke={DIM} strokeWidth="0.8" />
      <rect x="3.5" y="8.5" width="2" height="1.5" rx="0.3" stroke={DIM} strokeWidth="0.8" />
    </svg>
  )
}

function EnvIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1h6l3 3v9h-9V1Z" stroke={DIM} strokeWidth="0.9" fill={DIM} fillOpacity="0.07" strokeLinejoin="round" />
      <path d="M8.5 1v3h3" stroke={DIM} strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      <circle cx="5.5" cy="8.5" r="1.5" stroke={DIM} strokeWidth="0.9" />
      <path d="M7 8.5h2.5M8.5 8.5v1.5" stroke={DIM} strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  )
}

function GitIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1h6l3 3v9h-9V1Z" stroke={DIM} strokeWidth="0.9" fill={DIM} fillOpacity="0.07" strokeLinejoin="round" />
      <path d="M8.5 1v3h3" stroke={DIM} strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      <circle cx="5" cy="6.5" r="1" stroke={DIM} strokeWidth="0.85" />
      <circle cx="9" cy="6.5" r="1" stroke={DIM} strokeWidth="0.85" />
      <circle cx="5" cy="10" r="1" stroke={DIM} strokeWidth="0.85" />
      <path d="M5 7.5V9" stroke={DIM} strokeWidth="0.85" strokeLinecap="round" />
      <path d="M9 7.5v.5a2 2 0 0 1-2 2H6" stroke={DIM} strokeWidth="0.85" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function LockFileIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1h6l3 3v9h-9V1Z" stroke={DIM} strokeWidth="0.9" fill={DIM} fillOpacity="0.07" strokeLinejoin="round" />
      <path d="M8.5 1v3h3" stroke={DIM} strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      <rect x="4.5" y="8.5" width="5" height="3" rx="0.6" stroke={DIM} strokeWidth="0.9" />
      <path d="M5.5 8.5V7.5a1.5 1.5 0 0 1 3 0v1" stroke={DIM} strokeWidth="0.9" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function ConfigIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1h6l3 3v9h-9V1Z" stroke={DIM} strokeWidth="0.9" fill={DIM} fillOpacity="0.07" strokeLinejoin="round" />
      <path d="M8.5 1v3h3" stroke={DIM} strokeWidth="0.9" fill="none" strokeLinejoin="round" />
      <circle cx="7" cy="8.5" r="1.3" stroke={DIM} strokeWidth="0.9" />
      <path d="M7 6.5v.7M7 10.3v.7M5 8.5h.7M8.3 8.5H9M5.5 6.9l.5.5M8.5 9.6l-.5-.5M5.5 10.1l.5-.5M8.5 7.4l-.5.5"
        stroke={DIM} strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  )
}

export function getFileIcon(name: string, size = 14): React.ReactNode {
  const lower = name.toLowerCase()
  const ext = lower.split('.').pop() ?? ''

  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return <DockerfileIcon size={size} />
  if (lower === '.env' || lower.startsWith('.env.')) return <EnvIcon size={size} />
  if (lower === '.gitignore' || lower === '.gitattributes' || lower === '.gitmodules') return <GitIcon size={size} />
  if (lower === 'package-lock.json' || lower === 'yarn.lock' || lower === 'bun.lock' || lower === 'pnpm-lock.yaml' || lower === 'cargo.lock') return <LockFileIcon size={size} />
  if (lower.endsWith('.config.ts') || lower.endsWith('.config.js') || lower.endsWith('.config.mjs') || lower.endsWith('.config.cjs')) return <ConfigIcon size={size} />
  if (['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.mjs', 'eslint.config.js'].includes(lower)) return <ConfigIcon size={size} />

  switch (ext) {
    case 'ts': return <TypeScriptIcon size={size} />
    case 'tsx': return <TypeScriptReactIcon size={size} />
    case 'js': case 'mjs': case 'cjs': return <JavaScriptIcon size={size} />
    case 'jsx': return <JavaScriptReactIcon size={size} />
    case 'py': return <PythonIcon size={size} />
    case 'json': case 'jsonl': return <JsonIcon size={size} />
    case 'css': case 'less': return <CssIcon size={size} />
    case 'scss': return <ScssIcon size={size} />
    case 'html': case 'htm': return <HtmlIcon size={size} />
    case 'md': case 'mdx': return <MarkdownIcon size={size} />
    case 'yaml': case 'yml': return <YamlIcon size={size} />
    case 'toml': return <TomlIcon size={size} />
    case 'sh': case 'bash': case 'zsh': case 'fish': return <ShellIcon size={size} />
    case 'rs': return <RustIcon size={size} />
    case 'go': return <GoIcon size={size} />
    case 'sql': return <SqlIcon size={size} />
    case 'graphql': case 'gql': return <GraphqlIcon size={size} />
    case 'tf': case 'hcl': return <TerraformIcon size={size} />
    case 'doc': case 'docx': return <WordFileIcon size={size} />
    case 'ppt': case 'pptx': return <PptFileIcon size={size} />
    case 'xls': case 'xlsx': case 'csv': return <ExcelFileIcon size={size} />
    case 'pdf': return <PdfFileIcon size={size} />
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'bmp': case 'ico': case 'tiff': case 'tif': case 'avif':
      return <ImageFileIcon size={size} />
    case 'svg': return <SvgFileIcon size={size} />
    case 'zip': case 'rar': case '7z': case 'tar': case 'gz': case 'bz2': case 'xz':
      return <ArchiveFileIcon size={size} />
    case 'mp3': case 'wav': case 'flac': case 'ogg': case 'm4a': case 'aac':
      return <AudioFileIcon size={size} />
    case 'mp4': case 'mov': case 'avi': case 'mkv': case 'webm': case 'flv': case 'wmv':
      return <VideoFileIcon size={size} />
    case 'txt': case 'log': case 'rtf':
      return <TextFileIcon size={size} />
    case 'lock': return <LockFileIcon size={size} />
    default: return <GenericFileIcon size={size} />
  }
}
