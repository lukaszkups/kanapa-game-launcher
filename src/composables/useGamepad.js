import { onMounted, onUnmounted, ref } from 'vue'

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

const DISCONNECT_DEBOUNCE_MS = 750
const STICK_DEADZONE = 0.55
const SCROLL_DEADZONE = 0.22
const LEFT_STICK_COOLDOWN_MS = 180
const SCREENSHOT_COOLDOWN_MS = 220

export function useGamepad({
  itemCount,
  columns,
  selectedIndex,
  detailsOpen,
  enabled,
  onMove,
  onConfirm,
  onBack,
  onSecondary,
  onInstall,
  onFilterPrev,
  onFilterNext,
  onScreenshot,
  onShopScroll,
  onShopThumbsScroll,
}) {
  const connected = ref(false)
  const hint = ref('Connect a gamepad or use arrow keys')

  let rafId = 0
  let previousButtons = []
  let leftStickCooldown = 0
  let screenshotCooldown = 0
  let stickyPadIndex = null
  let disconnectTimer = 0

  function setConnected(isConnected) {
    if (connected.value === isConnected) return
    connected.value = isConnected
    hint.value = isConnected
      ? 'A launch · Y install/uninstall · L1/R1 tabs · L-stick grid · R-stick shop · D-pad shots'
      : 'Arrows grid · Enter launch · [ / ] tabs · I install/uninstall'
  }

  function clearButtonState() {
    previousButtons = []
    leftStickCooldown = 0
    screenshotCooldown = 0
  }

  function markConnected() {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer)
      disconnectTimer = 0
    }
    setConnected(true)
  }

  function scheduleDisconnect() {
    if (disconnectTimer || !connected.value) return
    disconnectTimer = window.setTimeout(() => {
      disconnectTimer = 0
      stickyPadIndex = null
      clearButtonState()
      setConnected(false)
    }, DISCONNECT_DEBOUNCE_MS)
  }

  function resolvePad(pads) {
    if (stickyPadIndex != null) {
      const sticky = pads[stickyPadIndex]
      if (sticky) return sticky
    }

    const index = pads.findIndex(Boolean)
    if (index === -1) return null
    stickyPadIndex = index
    return pads[index]
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

  function cycleScreenshot(delta, now) {
    if (!onScreenshot || now < screenshotCooldown) return
    onScreenshot(delta)
    screenshotCooldown = now + SCREENSHOT_COOLDOWN_MS
  }

  /** Gamepad API ignores window focus — gate actions ourselves. */
  function isInputActive() {
    if (document.visibilityState !== 'visible') return false
    if (!document.hasFocus()) return false
    if (enabled && !enabled()) return false
    return true
  }

  function syncPadPresence(pad) {
    if (pad) {
      markConnected()
      stickyPadIndex = pad.index
      // Track held buttons while inactive so resume does not edge-trigger launches.
      previousButtons = pad.buttons.map((button) => Boolean(button?.pressed))
      return
    }
    scheduleDisconnect()
  }

  function poll() {
    const pads = navigator.getGamepads?.() || []
    const pad = resolvePad(pads)

    if (!isInputActive()) {
      syncPadPresence(pad)
      rafId = requestAnimationFrame(poll)
      return
    }

    if (pad) {
      markConnected()
      stickyPadIndex = pad.index

      const buttons = pad.buttons
      const now = performance.now()

      // D-pad: screenshots in the shop sidebar
      if (pressed(buttons, BUTTON.LEFT) || pressed(buttons, BUTTON.UP)) {
        cycleScreenshot(-1, now)
      }
      if (pressed(buttons, BUTTON.RIGHT) || pressed(buttons, BUTTON.DOWN)) {
        cycleScreenshot(1, now)
      }

      // Left stick: grid selection
      if (!detailsOpen()) {
        const axisX = pad.axes[0] || 0
        const axisY = pad.axes[1] || 0
        if (now > leftStickCooldown) {
          if (axisX < -STICK_DEADZONE) {
            navigate('left')
            leftStickCooldown = now + LEFT_STICK_COOLDOWN_MS
          } else if (axisX > STICK_DEADZONE) {
            navigate('right')
            leftStickCooldown = now + LEFT_STICK_COOLDOWN_MS
          } else if (axisY < -STICK_DEADZONE) {
            navigate('up')
            leftStickCooldown = now + LEFT_STICK_COOLDOWN_MS
          } else if (axisY > STICK_DEADZONE) {
            navigate('down')
            leftStickCooldown = now + LEFT_STICK_COOLDOWN_MS
          }
        }
      }

      // Right stick: sidebar scroll (Y = body, X = screenshot thumbs)
      const rightX = pad.axes[2] || 0
      const rightY = pad.axes[3] || 0
      if (Math.abs(rightY) > SCROLL_DEADZONE) {
        onShopScroll?.(rightY * 22)
      }
      if (Math.abs(rightX) > SCROLL_DEADZONE) {
        onShopThumbsScroll?.(rightX * 18)
      }

      if (pressed(buttons, BUTTON.LB)) onFilterPrev?.()
      if (pressed(buttons, BUTTON.RB)) onFilterNext?.()
      if (pressed(buttons, BUTTON.A)) onConfirm()
      if (pressed(buttons, BUTTON.B)) onBack()
      if (pressed(buttons, BUTTON.X)) onSecondary()
      if (pressed(buttons, BUTTON.Y)) onInstall()

      previousButtons = buttons.map((button) => Boolean(button?.pressed))
    } else {
      scheduleDisconnect()
    }

    rafId = requestAnimationFrame(poll)
  }

  function onKeydown(event) {
    if (!isInputActive()) return
    if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) {
      return
    }

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
    if (key === '[' || key === ',') onFilterPrev?.()
    if (key === ']' || key === '.') onFilterNext?.()
    if (key === '-' || key === '_') onScreenshot?.(-1)
    if (key === '=' || key === '+') onScreenshot?.(1)
  }

  function onConnect(event) {
    stickyPadIndex = event.gamepad?.index ?? stickyPadIndex
    markConnected()
  }

  function onDisconnect(event) {
    if (event.gamepad?.index === stickyPadIndex) {
      stickyPadIndex = null
    }
    const pads = navigator.getGamepads?.() || []
    if ([...pads].some(Boolean)) {
      markConnected()
      return
    }
    scheduleDisconnect()
  }

  onMounted(() => {
    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)
    window.addEventListener('keydown', onKeydown)
    rafId = requestAnimationFrame(poll)
  })

  onUnmounted(() => {
    cancelAnimationFrame(rafId)
    if (disconnectTimer) clearTimeout(disconnectTimer)
    window.removeEventListener('gamepadconnected', onConnect)
    window.removeEventListener('gamepaddisconnected', onDisconnect)
    window.removeEventListener('keydown', onKeydown)
  })

  return { connected, hint }
}
