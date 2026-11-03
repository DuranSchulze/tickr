import type { SileoOptions, sileo } from 'sileo'

// Keep the notification library out of screens' initial bundles. This adapter
// preserves the app's message + description API while using Sileo to render.
type ToastOptions = Pick<SileoOptions, 'description'>
type ToastApi = Pick<typeof sileo, 'success' | 'error' | 'warning'>

let api: ToastApi | undefined
let loading: Promise<ToastApi> | undefined

function withToast(show: (toast: ToastApi) => void): void {
  if (api) {
    show(api)
    return
  }
  loading ??= import('sileo').then((mod) => {
    api = mod.sileo
    return api
  })
  void loading.then(show)
}

export const toast = {
  success: (message: string, options?: ToastOptions) =>
    withToast((notification) =>
      notification.success({ ...options, title: message }),
    ),
  error: (message: string, options?: ToastOptions) =>
    withToast((notification) =>
      notification.error({ ...options, title: message }),
    ),
  warning: (message: string, options?: ToastOptions) =>
    withToast((notification) =>
      notification.warning({ ...options, title: message }),
    ),
}
