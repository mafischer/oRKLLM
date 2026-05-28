import os from 'os';

export class MockEngine {
  constructor(modelPath, options = {}) {
    this.modelPath = modelPath;
    this.options = options;
    this.isAborted = false;
  }

  async run(prompt, callback) {
    this.isAborted = false;
    const responseText = `Hello! This is a simulated response from the oRKLLM Mock Engine running on ${os.platform()} (${os.arch()}).\n\n` +
      `You sent the prompt: "${prompt}"\n\n` +
      `Mock settings currently active:\n` +
      `- Temperature: ${this.options.temperature || 0.8}\n` +
      `- Top_P: ${this.options.top_p || 0.9}\n` +
      `- Top_K: ${this.options.top_k || 40}\n` +
      `- Max Tokens: ${this.options.max_new_tokens || 512}\n\n` +
      `oRKLLM is fully compatible with OpenAI API requests. During local development, this mock interface allows you to test the Fastify endpoints, WebSockets telemetry, and the Vue 3 + Vuetify dashboard interface in real-time. When deployed to the NanoPi M5 or other Rockchip NPU-powered board, the native N-API C++ addon will load your compiled .rkllm model and execute it directly on the NPU hardware.\n\n` +
      `Is there anything specific you would like to test or adjust in the user interface?`;

    const words = responseText.split(' ');
    let currentIdx = 0;
    
    // Simulate NPU prefill/load delay
    await new Promise((resolve) => setTimeout(resolve, 150));
    
    const prefill_time_ms = 120 + Math.random() * 30;
    const generate_start = Date.now();

    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (this.isAborted) {
          clearInterval(interval);
          callback({
            text: '',
            state: 2, // RKLLM_RUN_FINISH
            perf: {
              prefill_time_ms,
              prefill_tokens: 5,
              generate_time_ms: Date.now() - generate_start,
              generate_tokens: currentIdx
            }
          });
          resolve();
          return;
        }

        if (currentIdx >= words.length) {
          clearInterval(interval);
          callback({
            text: '',
            state: 2, // RKLLM_RUN_FINISH
            perf: {
              prefill_time_ms,
              prefill_tokens: 5,
              generate_time_ms: Date.now() - generate_start,
              generate_tokens: currentIdx
            }
          });
          resolve();
          return;
        }

        const chunk = (currentIdx === 0 ? '' : ' ') + words[currentIdx];
        callback({
          text: chunk,
          state: 0, // RKLLM_RUN_NORMAL
          perf: {
            prefill_time_ms,
            prefill_tokens: 5,
            generate_time_ms: Date.now() - generate_start,
            generate_tokens: currentIdx + 1
          }
        });

        currentIdx++;
      }, 40); // ~25 words/sec, which mirrors ~33 tokens/sec
    });
  }

  abort() {
    this.isAborted = true;
  }

  clearKVCache() {
    // Mock KV Cache clearing
  }
}
