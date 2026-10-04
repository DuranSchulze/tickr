# Announcements

The sidebar announcement card reads from **`announcement.md`** — edit that
single file to publish or change an announcement. It is displayed at the bottom
of the app sidebar until a user dismisses it with the ✕ button.

## Format

```md
---
title: Performance fixes are live
badge: Update
link: /app/changelog
linkLabel: See what's new
---

We've shipped a round of **performance fixes** across the app.
```

| Field       | Required | Notes                                                                                                          |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `title`     | yes      | The headline. **No title = no card.**                                                                          |
| `badge`     | no       | Small pill label, e.g. `Update`, `New`, `Maintenance`.                                                         |
| `link`      | no       | Where the call to action points. Internal (`/app/changelog`) or an absolute URL (`https://…` opens a new tab). |
| `linkLabel` | no       | Call-to-action text. Defaults to `Learn more`.                                                                 |

The body supports plain paragraphs, `**bold**`, and inline links like
`[see details](/pricing)`.

## Dismissing

Each user can close the card with the **✕** button. The dismissal is stored in
`localStorage` under a key derived from the announcement's content, so it is
per-browser and per-announcement:

- Dismissing hides the card for that user until they clear site data.
- **Editing `announcement.md` changes the content hash**, so a new or updated
  announcement is shown again to everyone who dismissed the old one. You do not
  need to do anything special to re-surface a message — just change the text.

## Turning it off for everyone

Remove the `title` line (or the whole file's frontmatter) and the card
disappears for everyone. When the sidebar is collapsed, the card becomes a
megaphone icon with a dot that links to `link` (or `/app/changelog`).

## Files

- `announcement.md` — the announcement content (this is the file you edit).
- `announcement.ts` — dependency-free parser (`parseAnnouncement`).
- `AnnouncementCard.tsx` — the sidebar card, rendered by `AppSidebar.tsx`.
