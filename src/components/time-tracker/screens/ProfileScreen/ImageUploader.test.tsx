// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { fireEvent } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageUploader } from './ImageUploader'

const getImageKitTokenFn = vi.fn()
const upload = vi.fn()

vi.mock('#/lib/server/tracker', () => ({
  getImageKitTokenFn: (...args: unknown[]) => getImageKitTokenFn(...args),
}))

vi.mock('@imagekit/react', () => ({
  upload: (...args: unknown[]) => upload(...args),
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const CURRENT_URL = 'https://cdn.example/old-avatar.png'

let objectUrlCounter = 0
const createObjectURL = vi.fn(() => `blob:mock-${++objectUrlCounter}`)
const revokeObjectURL = vi.fn()

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

function makePng() {
  return new File([new Uint8Array([1, 2, 3])], 'avatar.png', {
    type: 'image/png',
  })
}

describe('ImageUploader object URL lifecycle', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let unmounted: boolean

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    unmounted = false

    objectUrlCounter = 0
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    URL.createObjectURL =
      createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL =
      revokeObjectURL as unknown as typeof URL.revokeObjectURL

    getImageKitTokenFn.mockReset()
    upload.mockReset()
    getImageKitTokenFn.mockResolvedValue({
      publicKey: 'pk',
      token: 'token',
      expire: 0,
      signature: 'sig',
    })
  })

  afterEach(() => {
    if (!unmounted) act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  function renderUploader() {
    const onChange = vi.fn()
    act(() => {
      root.render(
        <ImageUploader currentUrl={CURRENT_URL} onChange={onChange} />,
      )
    })
    return onChange
  }

  async function chooseFile(file: File) {
    const input = container.querySelector('input[type="file"]')
    if (!input) throw new Error('file input not rendered')
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    // Let the async token/upload chain settle.
    await act(async () => {})
  }

  function previewSrc() {
    return container
      .querySelector('img[alt="Avatar preview"]')
      ?.getAttribute('src')
  }

  it('revokes the previous preview blob before creating the next one', async () => {
    vi.useFakeTimers()
    upload.mockResolvedValue({ url: 'https://cdn.example/new.png' })
    renderUploader()

    await chooseFile(makePng())
    const firstUrl = createObjectURL.mock.results[0]?.value
    expect(firstUrl).toBeTruthy()

    // Uploads are rate-limited for 60s; let the cooldown lapse.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    await chooseFile(makePng())

    expect(revokeObjectURL).toHaveBeenCalledWith(firstUrl)
  })

  it('revokes the preview blob when the upload fails', async () => {
    upload.mockRejectedValue(new Error('network down'))
    renderUploader()

    await chooseFile(makePng())

    const createdUrl = createObjectURL.mock.results[0]?.value
    expect(createdUrl).toBeTruthy()
    expect(revokeObjectURL).toHaveBeenCalledWith(createdUrl)
    expect(container.textContent).toContain('network down')
    // Preview is cleared, so the stored avatar URL is displayed again.
    expect(previewSrc()).toBe(CURRENT_URL)
  })

  it('revokes the final preview blob on unmount', async () => {
    upload.mockResolvedValue({ url: 'https://cdn.example/new.png' })
    renderUploader()

    await chooseFile(makePng())

    const createdUrl = createObjectURL.mock.results[0]?.value
    expect(createdUrl).toBeTruthy()
    // The blob preview stays visible until the server URL takes over.
    expect(previewSrc()).toBe(createdUrl)

    unmounted = true
    act(() => root.unmount())

    expect(revokeObjectURL).toHaveBeenCalledWith(createdUrl)
  })
})
