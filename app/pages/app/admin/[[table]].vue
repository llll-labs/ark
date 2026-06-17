<script setup lang="ts">
definePageMeta({
  layout: 'app',
})

await useArkCapabilityGate('settings.manage')

const route = useRoute()
const tableParam = Array.isArray(route.params.table)
  ? route.params.table[0]
  : route.params.table
const table = typeof tableParam === 'string' && tableParam.length > 0 ? tableParam : undefined

await navigateTo({
  path: '/app/settings',
  query: {
    section: 'content',
    ...(table ? { table } : {}),
  },
}, { redirectCode: 302, replace: true })
</script>

<template>
  <div />
</template>
