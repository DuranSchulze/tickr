import { useEffect, useRef, useState } from 'react'
import { upload } from '@imagekit/react'
import { Camera, Loader2, Upload } from 'lucide-react'
import { getImageKitTokenFn } from '#/lib/server/tracker'

const MAX_FILE_SIZE_MB = 2
const UPLOAD_COOLDOWN_S = 60

export function ImageUploader({
  currentUrl,
  onChange,
}: {
  currentUrl: string
  onChange: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function startCooldown() {
    setCooldownLeft(UPLOAD_COOLDOWN_S)
    intervalRef.current = setInterval(() => {
      setCooldownLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          intervalRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  async function handleFile(file: File) {
    if (cooldownLeft > 0) return

    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/)) {
      setError('Only JPEG, PNG, or WebP images are accepted.')
      return
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_FILE_SIZE_MB}MB.`)
      return
    }

    setError(null)
    setPreview(URL.createObjectURL(file))
    setUploading(true)

    try {
      const auth = await getImageKitTokenFn()

      const result = await upload({
        file,
        fileName: `avatar-${Date.now()}`,
        publicKey: auth.publicKey,
        token: auth.token,
        expire: auth.expire,
        signature: auth.signature,
        folder: '/avatars',
        useUniqueFileName: true,
      })

      if (!result.url)
        throw new Error('Upload succeeded but no URL was returned.')
      onChange(result.url)
      startCooldown()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Upload failed. Please try again.',
      )
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files.item(0)
    if (file) void handleFile(file)
  }

  const displayUrl = preview ?? currentUrl
  const disabled = uploading || cooldownLeft > 0

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => !disabled && inputRef.current?.click()}
        onDrop={disabled ? undefined : handleDrop}
        onDragOver={
          disabled
            ? undefined
            : (e) => {
                e.preventDefault()
                setDragging(true)
              }
        }
        onDragLeave={disabled ? undefined : () => setDragging(false)}
        disabled={disabled}
        className={`group relative mx-auto flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed transition-colors ${
          disabled
            ? 'cursor-not-allowed border-border bg-muted opacity-60'
            : dragging
              ? 'cursor-pointer border-primary bg-primary/10'
              : 'cursor-pointer border-border bg-muted hover:border-primary hover:bg-primary/5'
        }`}
        aria-label="Upload profile picture"
        title={
          cooldownLeft > 0
            ? `Please wait ${cooldownLeft}s before uploading again`
            : 'Click or drag an image to upload'
        }
      >
        {displayUrl ? (
          <>
            <img
              src={displayUrl}
              alt="Avatar preview"
              className="h-full w-full rounded-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              ) : cooldownLeft > 0 ? (
                <span className="text-sm font-semibold text-white">
                  {cooldownLeft}s
                </span>
              ) : (
                <Upload className="h-6 w-6 text-white" />
              )}
            </div>
          </>
        ) : uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : (
          <Camera className="h-8 w-8 text-muted-foreground" />
        )}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        {cooldownLeft > 0
          ? `Next upload available in ${cooldownLeft}s`
          : `Click or drag a JPEG · PNG · WebP to upload · max ${MAX_FILE_SIZE_MB}MB`}
      </p>

      {error && (
        <p className="text-center text-xs font-semibold text-destructive">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  )
}
