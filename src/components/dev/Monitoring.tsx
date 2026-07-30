import { useEffect } from 'react'

// Client-only performance monitoring. Renders nothing.
//
//  • react-grab (dev only): click any component in the page to select it,
//    then copy its source location + context to clipboard for AI coding agents
//    (Cursor, Claude Code, etc.).
//  • web-vitals: logs Core Web Vitals (LCP / INP / CLS / TTFB / FCP). Logged to
//    the console for now; swap the reporter for a POST to your own endpoint or a
//    provider (PostHog, Vercel) when you want a dashboard.
//
// All work happens inside useEffect so nothing runs during SSR.
export function Monitoring() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      void import('react-grab').then(({ init }) => {
        init({ enabled: true })
      })
    }

    void import('web-vitals').then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
      const report = (metric: {
        name: string
        value: number
        rating: string
      }) => {
        console.log(
          `[web-vitals] ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`,
        )
      }
      onCLS(report)
      onFCP(report)
      onINP(report)
      onLCP(report)
      onTTFB(report)
    })
  }, [])

  return null
}
