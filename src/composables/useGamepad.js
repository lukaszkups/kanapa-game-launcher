import { onMounted, onUnmounted, ref, watch } from 'vue'

const BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  SELECT: 8,
  START: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
}

export function useGamepad({
  itemCount,
  columns,
  selectedIndex,
  detailsOpen,
  onMove,
  onConfirm,
  onBack,
  onSecondary,
  onInstall,
}) {
  const connected = ref(false)
  const hint = ref('Connect a gamepad or use arrow keys')

  let rafId = 0
  let previousButtons = []
  let axisCooldown = 0

  function setConnected(isConnected) {
    connected.value = isConnected
    hint.value = isConnected
      ? 'A launch · X details · Y install · B back · D-pad / stick move'
      : 'Arrow keys move · Enter launch · D details · I install · Esc back'
  }

  function pressed(buttons, index) {
    return Boolean(buttons[index]?.pressed) && !previousButtons[index]
  }

  function navigate(delta) {
    const count = itemCount()
    if (!count) return
    const cols = Math.max(1, columns())
    const current = selectedIndex()
    let next = current

    if (delta === 'left') next = Math.max(0, current - 1)
    if (delta === 'right') next = Math.min(count - 1, current + 1)
    if (delta === 'up') next = Math.max(0, current - cols)
    if (delta === 'down') next = Math.min(count - 1, current + cols)

    if (next !== current) onMove(next)
  }

  function poll() {
    const pads = navigator.getGamepads?.() || []
    const pad = [...pads].find(Boolean)
    setConnected(Boolean(pad))

    if (pad) {
      const buttons = pad.buttons
      const now = performance.now()

      if (!detailsOpen()) {
        if (pressed(buttons, BUTTON.LEFT) || pressed(buttons, BUTTON.LB)) navigate('left')
        if (pressed(buttons, BUTTON.RIGHT) || pressed(buttons, BUTTON.RB)) navigate('right')
        if (pressed(buttons, BUTTON.UP)) navigate('up')
        if (pressed(buttons, BUTTON.DOWN)) navigate('down')

        const axisX = pad.axes[0] || 0
        const axisY = pad.axes[1] || 0
        if (now > axisCooldown) {
          if (axisX < -0.55) {
            navigate('left')
            axisCooldown = now + 180
          } else if (axisX > 0.55) {
            navigate('right')
            axisCooldown = now + 180
          } else if (axisY < -0.55) {
            navigate('up')
            axisCooldown = now + 180
          } else if (axisY > 0.55) {
            navigate('down')
            axisCooldown = now + 180
          }
        }
      }

      if (pressed(buttons, BUTTON.A)) onConfirm()
      if (pressed(buttons, BUTTON.B)) onBack()
      if (pressed(buttons, BUTTON.X)) onSecondary()
      if (pressed(buttons, BUTTON.Y)) onInstall()

      previousButtons = buttons.map((button) => Boolean(button?.pressed))
    }

    rafId = requestAnimationFrame(poll)
  }

  function onKeydown(event) {
    const key = event.key
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(key)) {
      event.preventDefault()
    }

    if (!detailsOpen()) {
      if (key === 'ArrowLeft') navigate('left')
      if (key === 'ArrowRight') navigate('right')
      if (key === 'ArrowUp') navigate('up')
      if (key === 'ArrowDown') navigate('down')
    }

    if (key === 'Enter') onConfirm()
    if (key === 'Escape' || key.toLowerCase() === 'b') onBack()
    if (key.toLowerCase() === 'd' || key.toLowerCase() === 'x') onSecondary()
    if (key.toLowerCase() === 'i' || key.toLowerCase() === 'y') onInstall()
  }

  function onConnect() {
    setConnected(true)
  }

  function onDisconnect() {
    const pads = navigator.getGamepads?.() || []
    setConnected([...pads].some(Boolean))
  }

  onMounted(() => {
    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)
    window.addEventListener('keydown', onKeydown)
    rafId = requestAnimationFrame(poll)
  })

  onUnmounted(() => {
    cancelAnimationFrame(rafId)
    window.removeEventListener('gamepadconnected', onConnect)
    window.removeEventListener('gamepaddisconnected', onDisconnect)
    window.removeEventListener('keydown', onKeydown)
  })

  watch(connected, () => {}, { flush: 'sync' })

  return { connected, hint }
}
