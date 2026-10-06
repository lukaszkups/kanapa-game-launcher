<script setup>
import { onMounted, ref, watch } from "vue";

const props = defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "saved"]);

const steamId = ref("");
const steamApiKey = ref("");
const keyHint = ref("");
const keyConfigured = ref(false);
const settingsPath = ref("");
const credentialSource = ref("none");
const launchOnStartup = ref(false);
const keepOnTop = ref(false);
const saving = ref(false);
const loading = ref(false);
const formError = ref("");
const keepExistingKey = ref(true);

async function loadSettings() {
  loading.value = true;
  formError.value = "";
  try {
    const response = await fetch("/api/settings");
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to load settings");
    steamId.value = payload.steamId || "";
    keyConfigured.value = Boolean(payload.steamApiKeyConfigured);
    keyHint.value = payload.steamApiKeyHint || "";
    steamApiKey.value = payload.steamApiKeyConfigured ? payload.steamApiKeyHint : "";
    keepExistingKey.value = Boolean(payload.steamApiKeyConfigured);
    settingsPath.value = payload.settingsPath || "";
    credentialSource.value = payload.credentialSource || "none";
    launchOnStartup.value = Boolean(payload.launchOnStartup);
    keepOnTop.value = Boolean(payload.keepOnTop);
  } catch (err) {
    formError.value = err.message || "Failed to load settings";
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) loadSettings();
  },
);

onMounted(() => {
  if (props.open) loadSettings();
});

function onKeyInput() {
  keepExistingKey.value = false;
}

async function save() {
  saving.value = true;
  formError.value = "";
  try {
    const body = {
      steamId: steamId.value.trim(),
      launchOnStartup: launchOnStartup.value,
      keepOnTop: keepOnTop.value,
    };
    if (!keepExistingKey.value) {
      body.steamApiKey = steamApiKey.value.trim();
    }
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to save settings");
    emit("saved", payload);
    emit("close");
  } catch (err) {
    formError.value = err.message || "Failed to save settings";
  } finally {
    saving.value = false;
  }
}

function onBackdrop(event) {
  if (event.target === event.currentTarget) emit("close");
}
</script>

<template>
  <div
    v-if="open"
    class="backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    @click="onBackdrop"
  >
    <div class="modal">
      <header>
        <h2 id="settings-title">Settings</h2>
        <button type="button" class="close" aria-label="Close" @click="$emit('close')">
          ×
        </button>
      </header>

      <p v-if="loading" class="status">Loading…</p>
      <p v-else-if="formError" class="status error">{{ formError }}</p>

      <form v-else class="form" @submit.prevent="save">
        <section class="block">
          <h3>Steam library</h3>
          <p class="lede">
            Optional. Without these, Kanapa only lists
            <strong>installed</strong> Steam games from local manifests.
          </p>

          <label>
            <span>Steam ID (64-bit)</span>
            <input
              v-model="steamId"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              placeholder="7656119…"
            />
          </label>

          <label>
            <span>Steam Web API key</span>
            <input
              v-model="steamApiKey"
              type="password"
              autocomplete="off"
              :placeholder="keyConfigured ? keyHint : 'Paste API key'"
              @input="onKeyInput"
            />
          </label>

          <p class="help">
            Get a key at
            <a
              href="https://steamcommunity.com/dev/apikey"
              target="_blank"
              rel="noreferrer"
              >steamcommunity.com/dev/apikey</a
            >.
            Leave the key field unchanged to keep the saved one.
          </p>
        </section>

        <section class="block">
          <h3>Desktop</h3>
          <p class="help">
            These apply when running the Electron desktop app
            (<code>npm run desktop</code>).
          </p>

          <label class="check">
            <input v-model="launchOnStartup" type="checkbox" />
            <span>Launch Kanapa when the system starts</span>
          </label>

          <label class="check">
            <input v-model="keepOnTop" type="checkbox" />
            <span>Keep window on top (paused while a game is running)</span>
          </label>
        </section>

        <p v-if="settingsPath" class="meta">
          Saved to <code>{{ settingsPath }}</code>
          <template v-if="credentialSource !== 'none'">
            · Steam source: {{ credentialSource }}
          </template>
        </p>

        <div class="actions">
          <button type="button" class="ghost" @click="$emit('close')">Cancel</button>
          <button type="submit" class="primary" :disabled="saving">
            {{ saving ? "Saving…" : "Save" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(8, 10, 14, 0.72);
}

.modal {
  width: min(460px, 100%);
  max-height: min(90vh, 720px);
  overflow: auto;
  border: 1px solid var(--black);
  background: #111;
  color: var(--gold);
  box-shadow: 8px 8px 0 rgba(18, 18, 18, 0.35);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border-bottom: 1px solid rgba(236, 189, 41, 0.25);
}

h2 {
  margin: 0;
  font-family: "Bebas Neue", sans-serif;
  font-size: 1.6rem;
  letter-spacing: 1px;
  color: #fff;
}

h3 {
  margin: 0;
  font-family: "Bebas Neue", sans-serif;
  font-size: 1.15rem;
  letter-spacing: 1px;
  color: #fff;
}

.close {
  border: 0;
  background: transparent;
  color: var(--gold);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}

.lede,
.help,
.meta,
.status {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: rgba(236, 189, 41, 0.85);
}

.status {
  padding: 0.85rem 1rem 0;
}

.lede strong {
  color: #fff;
}

.status.error {
  color: #ff8f8f;
}

.form {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}

.block {
  display: grid;
  gap: 0.75rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid rgba(236, 189, 41, 0.15);
}

label {
  display: grid;
  gap: 0.35rem;
}

label span {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

label.check {
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.65rem;
}

label.check span {
  text-transform: none;
  letter-spacing: 0.02em;
  font-size: 0.92rem;
  font-weight: 400;
  color: rgba(236, 189, 41, 0.92);
}

label.check input {
  width: auto;
  accent-color: var(--gold);
}

input[type="text"],
input[type="password"] {
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(236, 189, 41, 0.35);
  background: #0a0a0a;
  color: #fff;
}

.help a,
.help code,
.meta code {
  color: #fff;
}

.meta {
  font-size: 0.78rem;
  color: rgba(236, 189, 41, 0.65);
  word-break: break-all;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.primary,
.ghost {
  padding: 0.65rem 1rem;
  border: 1px solid var(--black);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.primary {
  background: var(--gold);
  color: #000;
  transform: skew(-8deg);
}

.ghost {
  background: transparent;
  color: var(--gold);
  border-color: rgba(236, 189, 41, 0.45);
}

.primary:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
