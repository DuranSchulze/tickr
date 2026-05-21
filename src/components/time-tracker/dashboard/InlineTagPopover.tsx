import { useState } from 'react'
import { Tag } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'

export function InlineTagPopover({
  tags,
  value,
  onChange,
  disabled,
}: {
  tags: SearchableItem[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selectedTags = tags.filter((t) => value.includes(t.id))

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-xs transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          {selectedTags.length > 0 ? (
            <>
              {selectedTags.slice(0, 2).map((tag) => (
                <span
                  key={tag.id}
                  className="rounded px-1.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: tag.color ? `${tag.color}22` : undefined,
                    color: tag.color,
                    border: `1px solid ${tag.color}55`,
                  }}
                >
                  {tag.name}
                </span>
              ))}
              {selectedTags.length > 2 && (
                <span className="text-muted-foreground">
                  +{selectedTags.length - 2}
                </span>
              )}
            </>
          ) : (
            <Tag className="h-3 w-3 text-muted-foreground/50" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        {tags.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No tags available
          </p>
        ) : (
          <div className="max-h-48 overflow-y-auto">
            {tags.map((tag) => {
              const checked = value.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent ${checked ? 'bg-accent' : ''}`}
                  onClick={() => toggle(tag.id)}
                >
                  <span
                    className={`h-3 w-3 rounded-sm border flex items-center justify-center shrink-0 transition-colors`}
                    style={{
                      borderColor: tag.color,
                      backgroundColor: checked ? tag.color : 'transparent',
                    }}
                  >
                    {checked && (
                      <svg
                        viewBox="0 0 8 8"
                        className="h-2 w-2 fill-white"
                        aria-hidden
                      >
                        <path
                          d="M1 4l2 2 4-4"
                          stroke="white"
                          strokeWidth="1.5"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="truncate" style={{ color: tag.color }}>
                    {tag.name}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
