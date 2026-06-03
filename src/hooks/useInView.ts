import { useEffect, useRef, useState } from 'react'

export function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  // The observer callback sets state async — options changes restart the observer
  // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1, ...options },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [options])
  // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change

  return { ref, inView }
}
