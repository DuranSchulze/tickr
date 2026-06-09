import { useEffect } from 'react'

// Client-only performance monitoring. Renders nothing.
//
//  • react-scan (dev only): overlays which components re-render and how
//    expensive each render is — the fastest way to find render hotspots.
//  • web-vitals: logs Core Web Vitals (LCP / INP / CLS / TTFB / FCP). Logged to
//    the console for now; swap the reporter for a POST to your own endpoint or a
//    provider (PostHog, Vercel) when you want a dashboard.
//
// All work happens inside useEffect so nothing runs during SSR.
export function Monitoring() {
  useEffect(() => {
    if (import.meta.env.DEV) {
      void import('react-scan').then(({ scan }) => {
        scan({ enabled: true })
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
