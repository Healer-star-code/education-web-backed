import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { userHomePath } from './pathGuards.ts'

const execFileAsync = promisify(execFile)

const SELECTED_PREFIX = 'SELECTED:'
const CANCELLED = 'CANCELLED'

export function parseDirectoryDialogOutput(output: string): string | null {
  const line = output.trim()
  if (line === CANCELLED) return null
  if (line.startsWith(SELECTED_PREFIX)) {
    const selectedPath = line.slice(SELECTED_PREFIX.length).trim()
    return selectedPath || null
  }
  throw new Error(`Unexpected directory dialog output: ${line}`)
}

export function createDirectoryDialogScript(initialPath = userHomePath()): string {
  const escapedInitialPath = initialPath.replace(/'/g, "''")
  return `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择 AI 要操作的项目文件夹'
$dialog.ShowNewFolderButton = $true
$initialPath = '${escapedInitialPath}'
if ([string]::IsNullOrWhiteSpace($initialPath) -or -not (Test-Path -LiteralPath $initialPath)) {
  $initialPath = [Environment]::GetFolderPath('UserProfile')
}
$dialog.SelectedPath = $initialPath
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  'SELECTED:' + $dialog.SelectedPath
} else {
  'CANCELLED'
}
`
}

export async function selectDirectoryWithWindowsDialog(): Promise<string | null> {
  const script = createDirectoryDialogScript()

  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-STA',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], {
    windowsHide: false,
  })

  return parseDirectoryDialogOutput(stdout)
}
