<script setup>
import SpellbookExporter from './components/SpellbookExporter.vue';
</script>

<template>
  <h1 class="font-bold text-3xl">NAI 法典生成器</h1>
  <p class="text-gray-500 my-2 text-sm">
    读取 NAI 生成图片中的生成信息，并将信息导出到 HTML 表格中
  </p>
  <SpellbookExporter />
  <p class="text-gray-500 my-2 text-sm">
    *计算完全在本地进行
  </p>
  <div class="my-4 pt-4">
    <a class="inline-block text-sm text-gray-500"
      href="https://github.com/Exception0x0194/NAI-Spellbook-Exporter">GitHub</a>
    <br />
  </div>
</template>

<style scoped></style>
