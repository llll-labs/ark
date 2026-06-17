<script setup lang="ts">
// Permissions matrix (roles × capabilities). Each checkbox is an ark_grant on
// the root space; toggling calls admin.setGrant. Admin-only.
// NOTE: system roles (member/moderator/anon) are reconciled from code on boot,
// so toggles on them are runtime-only until the next deploy/restart; create a
// custom role for durable per-environment grants.
const { $trpc } = useNuxtApp()

withDefaults(defineProps<{
  showHeader?: boolean
}>(), {
  showHeader: true,
})

const { data, refresh } = await useAsyncData('admin-permissions', () => $trpc.ark.admin.permissions.query())

const roles = computed(() => data.value?.roles ?? [])
const grantMap = ref<Record<string, string[]>>({})
watch(data, () => {
  grantMap.value = { ...(data.value?.grants ?? {}) }
}, { immediate: true })

// Group capabilities by their first segment (market, channels, …) for scanning.
const groups = computed(() => {
  const map = new Map<string, string[]>()
  for (const capability of (data.value?.capabilities ?? [])) {
    const group = capability.split('.')[0] ?? 'other'
    if (!map.has(group))
      map.set(group, [])
    map.get(group)!.push(capability)
  }
  return [...map.entries()].map(([group, capabilities]) => ({ group, capabilities }))
})

function has(roleId: string, capability: string) {
  return (grantMap.value[roleId] ?? []).includes(capability)
}

const saving = ref('')
async function toggle(roleId: string, capability: string) {
  const allow = !has(roleId, capability)
  saving.value = `${roleId}:${capability}`
  const next = new Set(grantMap.value[roleId] ?? [])
  if (allow)
    next.add(capability)
  else
    next.delete(capability)
  grantMap.value = { ...grantMap.value, [roleId]: [...next] }
  try {
    await $trpc.ark.admin.setGrant.mutate({ roleId, capability, allow })
  }
  catch {
    await refresh()
  }
  saving.value = ''
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-default">
    <header v-if="showHeader" class="shrink-0 border-b border-default px-4 py-3 lg:px-6">
      <h1 class="text-base font-semibold leading-6 text-highlighted">
        {{ $t('admin.permissionsTitle') }}
      </h1>
      <p class="text-xs text-muted">
        {{ $t('admin.permissionsHint') }}
      </p>
    </header>

    <div class="ark-scrollbar min-h-0 flex-1 overflow-auto">
      <table class="border-collapse text-sm">
        <thead class="sticky top-0 z-10 bg-elevated">
          <tr>
            <th class="sticky left-0 z-20 border-b border-default bg-elevated px-3 py-2 text-left font-semibold text-toned">
              {{ $t('admin.capability') }}
            </th>
            <th
              v-for="role in roles"
              :key="role.id"
              class="border-b border-default px-4 py-2 text-center font-semibold text-toned"
            >
              {{ role.name }}
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-for="grp in groups" :key="grp.group">
            <tr>
              <td :colspan="roles.length + 1" class="bg-muted/40 px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {{ grp.group }}
              </td>
            </tr>
            <tr v-for="capability in grp.capabilities" :key="capability" class="border-b border-default/60 hover:bg-white/[0.02]">
              <td class="sticky left-0 bg-default px-3 py-1.5 font-mono text-xs text-toned">
                {{ capability }}
              </td>
              <td v-for="role in roles" :key="role.id" class="px-4 py-1.5 text-center">
                <input
                  type="checkbox"
                  class="size-4 cursor-pointer accent-primary"
                  :checked="has(role.id, capability)"
                  :disabled="saving === `${role.id}:${capability}`"
                  @change="toggle(role.id, capability)"
                >
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
