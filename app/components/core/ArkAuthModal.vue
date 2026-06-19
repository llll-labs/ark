<script setup lang="ts">
interface AuthModalStat {
  label: string
  value: string
}

const props = withDefaults(defineProps<{
  brandSubtitle?: string
  brandTitle?: string
  intentTitle?: string
  modelValue: boolean
  redirectPath?: string
  stats?: AuthModalStat[]
}>(), {
  brandSubtitle: '',
  brandTitle: '',
  intentTitle: '',
  redirectPath: '',
  stats: () => [],
})

const emit = defineEmits<{
  'authenticated': []
  'update:modelValue': [value: boolean]
}>()

const route = useRoute()

const open = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const modalUi = {
  body: '!p-0',
  content: 'w-[min(520px,calc(100vw-1.5rem))] !max-w-none divide-y-0 overflow-hidden bg-default text-default ring-1 ring-default shadow-2xl',
  header: 'hidden',
  overlay: 'bg-black/70 backdrop-blur-sm',
}

function closeForNavigation() {
  open.value = false
}

function finishAuth() {
  emit('authenticated')
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="intentTitle || $t('auth.tabLogin')" :ui="modalUi">
    <template #header>
      <div />
    </template>
    <template #body>
      <div class="relative p-6 sm:p-7">
        <button
          type="button"
          class="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-accented hover:text-default"
          aria-label="Закрыть"
          @click="open = false"
        >
          <UIcon name="i-lucide-x" class="size-5" />
        </button>

        <Suspense>
          <ArkAuthPanel
            :brand-subtitle="brandSubtitle"
            :brand-title="brandTitle"
            :intent-title="intentTitle"
            :oauth-redirect="redirectPath || route.fullPath"
            :stats="stats"
            @authenticated="finishAuth"
            @navigate="closeForNavigation"
          />
        </Suspense>

        <ArkLocaleSelect class="mt-4" />
      </div>
    </template>
  </UModal>
</template>
