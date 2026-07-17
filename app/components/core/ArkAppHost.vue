<script setup lang="ts">
interface AppSettingsSection {
  icon: string
  id: string
  label: string
  slot?: string
}

interface UserSettingsSection {
  icon: string
  id: string
  label: string
}

const props = withDefaults(defineProps<{
  appSettingsSections?: AppSettingsSection[]
  loginPath?: string
  logoTo?: string
  pageNavigationRoute?: string
  rootSpaceRoute?: string
  userSettingsExtraSections?: UserSettingsSection[]
  userSettingsHiddenSections?: string[]
}>(), {
  appSettingsSections: () => [],
  loginPath: '/login',
  logoTo: '',
  pageNavigationRoute: '/app',
  rootSpaceRoute: '/app',
  userSettingsExtraSections: () => [],
  userSettingsHiddenSections: () => [],
})

const route = useRoute()
const auth = useArkAuth()
const slots = useSlots()
const forwardedSlotNames = computed(() => Object.keys(slots).filter(name => name !== 'default'))
const me = auth.checked.value ? auth.me.value : await auth.check()

if (!me?.authenticated) {
  await navigateTo({
    path: props.loginPath,
    query: { redirect: route.fullPath },
  }, { replace: true })
}
</script>

<template>
  <ArkShell
    :app-settings-sections="props.appSettingsSections"
    :logo-to="props.logoTo"
    :page-navigation-route="props.pageNavigationRoute"
    :root-space-route="props.rootSpaceRoute"
    :user-settings-extra-sections="props.userSettingsExtraSections"
    :user-settings-hidden-sections="props.userSettingsHiddenSections"
  >
    <template v-for="name in forwardedSlotNames" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps || {}" />
    </template>
    <slot />
  </ArkShell>
</template>
