import type { ApiImagePayload } from './types.ts'

export interface SdkImageContent {
  type: 'image'
  data: string
  mimeType: string
}

export function toSdkImages(images: ApiImagePayload[] | undefined): SdkImageContent[] | undefined {
  if (!images || images.length === 0) return undefined
  const validImages = images
    .filter((image) => image.data.length > 0 && image.mimeType.startsWith('image/'))
    .map((image) => ({ type: 'image' as const, data: image.data, mimeType: image.mimeType }))
  return validImages.length > 0 ? validImages : undefined
}
