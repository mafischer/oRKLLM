<template>
  <v-app>
    <router-view />
  </v-app>
</template>

<script>
export default {
  name: 'App'
}
</script>

<style>
html, body {
  margin: 0;
  padding: 0;
  background-color: #0B0F19 !important;
  font-family: 'Roboto', sans-serif;
}

/* Custom scrollbars for slate theme consistency */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: #0B0F19;
}
::-webkit-scrollbar-thumb {
  background: #1F2937;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #374151;
}
</style>
