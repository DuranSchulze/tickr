import { describe, expect, it } from 'vitest'
import { parseAnnouncement } from './announcement'

const full = `---
title: Performance fixes are live
badge: Update
link: /app/changelog
linkLabel: See what's new
---

We've shipped **performance fixes** across the app.`

describe('parseAnnouncement', () => {
  it('parses every frontmatter field and the body', () => {
    expect(parseAnnouncement(full)).toEqual({
      title: 'Performance fixes are live',
      badge: 'Update',
      link: '/app/changelog',
      linkLabel: "See what's new",
      body: "We've shipped **performance fixes** across the app.",
    })
  })

  it('defaults the link label and nulls optional fields when omitted', () => {
    const result = parseAnnouncement('---\ntitle: Heads up\n---\nBody copy.')
    expect(result).toEqual({
      title: 'Heads up',
      badge: null,
      link: null,
      linkLabel: 'Learn more',
      body: 'Body copy.',
    })
  })

  it('strips surrounding quotes from values', () => {
    const result = parseAnnouncement(
      '---\ntitle: "Quoted title"\nlink: \'https://example.com\'\n---\n',
    )
    expect(result?.title).toBe('Quoted title')
    expect(result?.link).toBe('https://example.com')
  })

  it('returns null when there is no frontmatter', () => {
    expect(parseAnnouncement('Just some text')).toBeNull()
  })

  it('returns null when the title is missing or blank', () => {
    expect(parseAnnouncement('---\nbadge: Update\n---\nBody.')).toBeNull()
    expect(parseAnnouncement('---\ntitle: "  "\n---\nBody.')).toBeNull()
  })
})
