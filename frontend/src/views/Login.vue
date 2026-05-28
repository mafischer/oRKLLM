<template>
  <v-main class="bg-slate-page fill-height">
    <v-container class="fill-height justify-center" fluid>
      <v-card class="mx-auto pa-8 glass-card" max-width="450" elevation="12">
        <div class="text-center mb-6">
          <v-icon color="primary" size="64" class="mb-2">mdi-lock-open-outline</v-icon>
          <h1 class="text-h4 font-weight-bold text-gradient">oRKLLM Login</h1>
          <p class="text-subtitle-1 text-grey-darken-1">Access your administration console</p>
        </div>

        <v-form ref="form" v-model="valid" @submit.prevent="submitLogin">
          <v-text-field
            v-model="username"
            label="Username"
            prepend-inner-icon="mdi-account"
            required
            variant="outlined"
            color="primary"
            :rules="[v => !!v || 'Username is required']"
          ></v-text-field>

          <v-text-field
            v-model="password"
            label="Password"
            prepend-inner-icon="mdi-lock"
            type="password"
            required
            variant="outlined"
            color="primary"
            :rules="[v => !!v || 'Password is required']"
          ></v-text-field>

          <v-alert
            v-if="errorMessage"
            type="error"
            variant="tonal"
            class="mb-4"
            closable
            @click:close="errorMessage = ''"
          >
            {{ errorMessage }}
          </v-alert>

          <v-btn
            type="submit"
            color="primary"
            block
            size="large"
            class="mt-4 font-weight-bold"
            :loading="loading"
            :disabled="!valid"
          >
            Sign In
          </v-btn>
        </v-form>
      </v-card>
    </v-container>
  </v-main>
</template>

<script>
export default {
  name: 'Login',
  data: () => ({
    valid: false,
    username: '',
    password: '',
    loading: false,
    errorMessage: '',
  }),
  methods: {
    async submitLogin() {
      if (!this.valid) return;
      this.loading = true;
      this.errorMessage = '';

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: this.username,
            password: this.password,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          this.$router.push('/');
        } else {
          this.errorMessage = data.error || 'Invalid credentials';
        }
      } catch (e) {
        this.errorMessage = 'Network connection error';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.glass-card {
  background: rgba(17, 24, 39, 0.7) !important;
  backdrop-filter: blur(16px);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 16px !important;
}

.text-gradient {
  background: linear-gradient(135deg, #7C3AED 0%, #F43F5E 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
</style>
