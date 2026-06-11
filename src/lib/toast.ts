// Lazy facade over goey-toast. The real library (goey-toast + sonner,
// ~190 KB) is loaded on demand instead of being statically imported by every
// screen that can show a toast — keeping it out of the initial bundle.
//
// Import `gooeyToast` from here (`#/lib/toast`), not from 'goey-toast'.

type ToastOptions = { description?: string }

// Structural subset of goey-toast's `gooeyToast` API — only the methods this
// codebase actually calls.
type ToastApi = {
  success: (message: string, options?: ToastOptions) => unknown
  error: (message: string, options?: ToastOptions) => unknown
  warning: (message: string, options?: ToastOptions) => unknown
}

let api: ToastApi | undefined
let loading: Promise<ToastApi> | undefined

function withToast(show: (toast: ToastApi) => void): void {
  if (api) {
    show(api)
    return
  }
  loading ??= import('goey-toast').then((mod) => {
    api = mod.gooeyToast
    return api
  })
  void loading.then(show)
}

export const gooeyToast = {
  success: (message: string, options?: ToastOptions) =>
    withToast((toast) => toast.success(message, options)),
  error: (message: string, options?: ToastOptions) =>
    withToast((toast) => toast.error(message, options)),
  warning: (message: string, options?: ToastOptions) =>
    withToast((toast) => toast.warning(message, options)),
}
