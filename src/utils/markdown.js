import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

export function renderMarkdown(source = '') {
  const text = String(source || '').trim()
  if (!text) return ''
  return marked.parse(text, { async: false })
}
