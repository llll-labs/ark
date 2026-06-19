<script setup lang="ts">
import ArkAvatar from './ArkAvatar.vue'
import ArkUserSettingsModal from './ArkUserSettingsModal.vue'

const props = withDefaults(defineProps<{
  appTo?: string
  loginTo?: string
  showName?: boolean
}>(), {
  appTo: '/app',
  loginTo: '/login',
  showName: false,
})

const route = useRoute()
const auth = useArkAuth()
const settingsOpen = ref(false)
await auth.checkSession().catch(() => null)
const name = computed(() => auth.me.value?.arkUser?.displayName || auth.me.value?.user?.name || '')
const initials = computed(() => nameInitials(name.value, 'M'))
const avatarSrc = computed(() => arkAvatarFileUrl(auth.me.value?.arkUser?.avatarFileId))
const loginTarget = computed(() => ({
  path: props.loginTo,
  query: route.fullPath === props.loginTo ? {} : { redirect: route.fullPath },
}))

</script>

<template>
  <div class="inline-flex items-center">
    <UButton
      v-if="!auth.authenticated.value"
      :to="loginTarget"
      color="neutral"
      variant="ghost"
      icon="i-lucide-log-in"
    >
      {{ $t('common.login') }}
    </UButton>

    <div v-else class="inline-flex items-center gap-1">
      <UButton
        v-if="showName"
        :to="appTo"
        color="neutral"
        variant="ghost"
        icon="i-lucide-layout-dashboard"
      >
        {{ name }}
      </UButton>
      <button
        type="button"
        class="inline-grid size-9 place-items-center rounded-full p-0.5 text-highlighted transition hover:bg-white/[0.06]"
        :aria-label="$t('shell.openSettings')"
        @click="settingsOpen = true"
      >
        <ArkAvatar :src="avatarSrc" :name="name" :initials="initials" size="sm" />
      </button>
    </div>

    <ArkUserSettingsModal v-model:open="settingsOpen" />
  </div>
</template>
