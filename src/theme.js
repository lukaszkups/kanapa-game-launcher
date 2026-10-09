export const THEMES = [
  { id: 'default', label: 'Default', hint: 'Kanapa gold' },
  { id: 'blue', label: 'Blue', hint: 'Team Blue' },
  { id: 'green', label: 'Green', hint: 'Team Green' },
  { id: 'red', label: 'Red', hint: 'Team Red' },
]

export function normalizeTheme(theme) {
  const id = String(theme || '').trim().toLowerCase()
  return THEMES.some((entry) => entry.id === id) ? id : 'default'
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = normalizeTheme(theme)
}
