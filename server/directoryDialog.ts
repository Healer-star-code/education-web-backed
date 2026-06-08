import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

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

export async function selectDirectoryWithWindowsDialog(): Promise<string | null> {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择 AI 要操作的项目文件夹'
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  'SELECTED:' + $dialog.SelectedPath
} else {
  'CANCELLED'
}
`

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
