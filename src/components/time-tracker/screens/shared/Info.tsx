export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="m-0 mt-1 text-base font-bold text-foreground">{value}</dd>
    </div>
  )
}
