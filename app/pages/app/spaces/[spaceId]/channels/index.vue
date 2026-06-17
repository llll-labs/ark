<script setup lang="ts">
definePageMeta({
  layout: 'app',
})

const route = useRoute()
await navigateTo(`/app/spaces/${route.params.spaceId}`, { replace: true })
</script>
