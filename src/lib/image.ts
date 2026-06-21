export async function fileToBase64(file: File): Promise<{ name: string; mimeType: string; data: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
  const comma = dataUrl.indexOf(',')
  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    data: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
  }
}
