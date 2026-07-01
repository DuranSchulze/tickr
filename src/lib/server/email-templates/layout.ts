import { BRAND } from '#/lib/brand'

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

type EmailLayoutInput = {
  title: string
  children: string
}

type EmailActionInput = {
  href: string
  label: string
}

type DetailRow = {
  label: string
  value: string
  monospace?: boolean
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderEmailLayout({ title, children }: EmailLayoutInput): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#172033;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 14px;background:#f6f7f9;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background:#ffffff;border:1px solid #dfe4ea;border-radius:10px;overflow:hidden;">
            <tr>
              <td align="center" style="padding:34px 30px 20px 30px;border-bottom:1px solid #edf0f3;background:#ffffff;">
                <div style="font-size:44px;line-height:1;font-weight:850;letter-spacing:0;color:#111827;">${escapeHtml(BRAND.name)}</div>
                <div style="margin-top:12px;font-size:13px;line-height:1.5;color:#7b8491;">${escapeHtml(BRAND.tagline)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 30px 10px 30px;">
                <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:800;letter-spacing:0;color:#172033;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 30px 30px 30px;font-size:15px;line-height:1.65;color:#3b4554;">
                ${children}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 30px;background:#f8fafc;border-top:1px solid #edf0f3;font-size:12px;line-height:1.5;color:#8a94a3;">
                ${escapeHtml(BRAND.name)} - ${escapeHtml(BRAND.description)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 14px 0;">${html}</p>`
}

export function mutedParagraph(html: string): string {
  return `<p style="margin:0 0 14px 0;font-size:13px;line-height:1.6;color:#667085;">${html}</p>`
}

export function renderButton({ href, label }: EmailActionInput): string {
  const safeHref = escapeHtml(href)
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0 18px 0;">
    <tr>
      <td align="center">
        <a href="${safeHref}" style="display:inline-block;background:#273449;color:#ffffff;text-decoration:none;font-weight:750;font-size:14px;line-height:1;padding:14px 22px;border-radius:7px;border:1px solid #273449;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`
}

export function renderDetailTable(rows: DetailRow[]): string {
  const visibleRows = rows.filter((row) => row.value.trim().length > 0)
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:20px 0;background:#f8fafc;border:1px solid #dfe4ea;border-radius:8px;overflow:hidden;">
    ${visibleRows
      .map((row, index) => {
        const border =
          index === visibleRows.length - 1 ? '' : 'border-bottom:1px solid #e7ebef;'
        const valueStyle = row.monospace
          ? "font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;"
          : ''
        return `<tr>
          <td style="padding:11px 14px;width:116px;${border}font-size:12px;line-height:1.4;font-weight:700;color:#697386;">${escapeHtml(row.label)}</td>
          <td style="padding:11px 14px;${border}font-size:13px;line-height:1.45;color:#172033;${valueStyle}">${escapeHtml(row.value)}</td>
        </tr>`
      })
      .join('')}
  </table>`
}

export function renderCodeBlock(code: string, label: string, helper?: string): string {
  return `<div style="margin:24px 0;padding:22px 18px;background:#f8fafc;border:1px solid #dfe4ea;border-radius:8px;text-align:center;">
    <div style="margin:0 0 10px 0;font-size:12px;line-height:1.4;color:#697386;text-transform:uppercase;font-weight:800;letter-spacing:0.08em;">${escapeHtml(label)}</div>
    <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:36px;line-height:1.15;font-weight:850;letter-spacing:0.16em;color:#172033;">${escapeHtml(code)}</div>
    ${helper ? `<div style="margin-top:10px;font-size:12px;line-height:1.5;color:#8a94a3;">${escapeHtml(helper)}</div>` : ''}
  </div>`
}

export function renderFallbackLink(url: string): string {
  const safeUrl = escapeHtml(url)
  return mutedParagraph(
    `Or paste this link in your browser:<br><a href="${safeUrl}" style="color:#42526e;word-break:break-all;">${safeUrl}</a>`,
  )
}
