<script setup lang="ts">
import { formatDate } from '../../utils/arkFormat'

/**
 * Admin panel listing stores awaiting review. Notes are held in the
 * parent-owned `reviewNotes` record (keyed by store id); `review` is
 * emitted with the chosen action.
 */
interface TaxonomyOption { id: string, name: string }

const props = defineProps<{
  pendingProfiles: any[]
  categoryOptions: TaxonomyOption[]
  tagOptions: TaxonomyOption[]
  workingProfileId: string
}>()

const emit = defineEmits<{ review: [profile: any, action: 'approve' | 'reject'] }>()
// Two-way bound so the per-store note textarea mutates the model, not a prop.
const reviewNotes = defineModel<Record<string, string>>('reviewNotes', { required: true })

function taxonomyName(id: string, rows: TaxonomyOption[] | undefined) {
  return rows?.find(row => row.id === id)?.name ?? null
}
function profileMeta(profile: any) {
  return [profile.headline, profile.serviceSummary, profile.portfolioUrl].filter(Boolean).join(' · ')
}
</script>

<template>
  <section class="mb-3 grid gap-3 rounded-lg border border-default bg-elevated p-3 sm:p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 class="text-sm font-semibold text-highlighted">
          {{ $t('store.reviewTitle') }}
        </h2>
        <p class="text-xs text-muted">
          {{ $t('store.reviewSubtitle') }}
        </p>
      </div>
      <UBadge color="neutral" variant="subtle">
        {{ $t('store.reviewPendingCount', { count: props.pendingProfiles.length }) }}
      </UBadge>
    </div>

    <div v-if="props.pendingProfiles.length" class="grid gap-2">
      <article
        v-for="profile in props.pendingProfiles"
        :key="profile.id"
        class="grid gap-3 rounded-md border border-default bg-muted p-3"
      >
        <div class="grid gap-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-sm font-semibold text-highlighted">
              {{ profile.name }}
            </h3>
            <span class="rounded bg-elevated px-2 py-0.5 text-xs text-muted">{{ profile.status }}</span>
            <span v-if="profile.submittedAt" class="text-xs text-muted">{{ formatDate(profile.submittedAt) }}</span>
          </div>
          <p v-if="profileMeta(profile)" class="line-clamp-2 text-xs leading-5 text-toned">
            {{ profileMeta(profile) }}
          </p>
          <div class="flex flex-wrap gap-2 text-xs text-muted">
            <span v-for="categoryId in (profile.categoryIds ?? [])" :key="`${profile.id}-profile-category-${categoryId}`" class="rounded bg-elevated px-2 py-1">
              {{ taxonomyName(categoryId, props.categoryOptions) ?? $t('store.categoryFallback') }}
            </span>
            <span v-for="tagId in (profile.tagIds ?? [])" :key="`${profile.id}-profile-tag-${tagId}`" class="rounded bg-elevated px-2 py-1">
              #{{ taxonomyName(tagId, props.tagOptions) ?? $t('store.tagFallback') }}
            </span>
          </div>
        </div>

        <textarea
          v-model="reviewNotes[profile.id]"
          rows="2"
          :placeholder="$t('store.reviewNotePlaceholder')"
          class="min-h-10 rounded border border-default bg-elevated px-3 py-2 text-sm leading-6 text-default outline-none placeholder:text-muted focus:border-white/20"
        />

        <div class="flex flex-wrap justify-end gap-2">
          <UButton type="button" size="xs" color="error" variant="soft" icon="i-lucide-user-x" :loading="props.workingProfileId === profile.id" @click="emit('review', profile, 'reject')">
            {{ $t('store.reject') }}
          </UButton>
          <UButton type="button" size="xs" color="success" variant="soft" icon="i-lucide-user-check" :loading="props.workingProfileId === profile.id" @click="emit('review', profile, 'approve')">
            {{ $t('store.approve') }}
          </UButton>
        </div>
      </article>
    </div>
    <p v-else class="rounded-md border border-dashed border-white/10 px-3 py-4 text-center text-sm text-muted">
      {{ $t('store.reviewEmpty') }}
    </p>
  </section>
</template>
