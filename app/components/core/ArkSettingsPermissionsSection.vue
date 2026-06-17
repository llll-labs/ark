<script setup lang="ts">
import ArkAdminPermissions from './ArkAdminPermissions.vue'

const props = defineProps<{
  reloadSignal?: number
}>()
const permissionsMatrixKey = ref(0)

watch(() => props.reloadSignal, () => {
  permissionsMatrixKey.value += 1
})
</script>

<template>
  <section class="grid gap-4">
    <div class="min-h-[32rem] overflow-hidden rounded-lg border border-default bg-default">
      <ArkAdminPermissions :key="permissionsMatrixKey" :show-header="false" class="h-full min-h-[32rem]" />
    </div>
  </section>
</template>
