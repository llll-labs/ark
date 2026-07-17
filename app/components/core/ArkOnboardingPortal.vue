<template>
  <main class="ark-scrollbar h-dvh overflow-y-auto bg-muted px-3 py-4 text-default sm:px-4 sm:py-8">
    <section class="mx-auto w-full max-w-[760px] rounded-xl border border-default bg-elevated shadow-2xl shadow-black/30">
      <header class="border-b border-default px-6 pb-5 pt-6">
        <slot name="logo">
          <ArkLogo />
        </slot>
        <div class="mt-5">
          <p class="text-sm font-medium text-primary">
            {{ $t('onboarding.oneMoreStep') }}
          </p>
          <h1 class="mt-1 text-xl font-semibold text-highlighted">
            {{ $t('onboarding.title') }}
          </h1>
        </div>
      </header>

      <div class="px-6 py-6">
        <slot />
      </div>
    </section>
  </main>
</template>
