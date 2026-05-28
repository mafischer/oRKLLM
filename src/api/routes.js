import fs from 'fs';
import path from 'path';
import { MODELS_DIR } from '../config.js';
import pool from '../pool.js';
import { recordRequest } from '../stats.js';

export default async function apiRoutes(fastify, options) {
  
  // GET /v1/models
  fastify.get('/models', async (request, reply) => {
    try {
      const files = fs.readdirSync(MODELS_DIR);
      const rkllmFiles = files.filter(f => f.endsWith('.rkllm'));
      
      const data = rkllmFiles.map(file => {
        const stats = fs.statSync(path.join(MODELS_DIR, file));
        return {
          id: file,
          object: 'model',
          created: Math.floor(stats.birthtimeMs / 1000),
          owned_by: 'orkllm',
          size: stats.size
        };
      });

      return {
        object: 'list',
        data
      };
    } catch (e) {
      reply.status(500).send({ error: e.message });
    }
  });

  // POST /v1/chat/completions
  fastify.post('/chat/completions', async (request, reply) => {
    const {
      model,
      messages,
      stream = false,
      temperature = 0.8,
      top_p = 0.9,
      top_k = 40,
      max_tokens = 512
    } = request.body || {};

    if (!model) {
      return reply.status(400).send({ error: "Missing required field 'model'" });
    }
    if (!messages || !Array.isArray(messages)) {
      return reply.status(400).send({ error: "Missing or invalid field 'messages'" });
    }

    // Convert chat messages to ChatML format prompt
    let prompt = "";
    for (const msg of messages) {
      if (msg.role === 'system') {
        prompt += `<|im_start|>system\n${msg.content}<|im_end|>\n`;
      } else if (msg.role === 'user') {
        prompt += `<|im_start|>user\n${msg.content}<|im_end|>\n`;
      } else if (msg.role === 'assistant') {
        prompt += `<|im_start|>assistant\n${msg.content}<|im_end|>\n`;
      }
    }
    prompt += `<|im_start|>assistant\n`;

    const modelOptions = {
      temperature,
      top_p,
      top_k,
      max_new_tokens: max_tokens
    };

    const completionId = 'chatcmpl-' + Math.random().toString(36).substring(2, 15);
    const created = Math.floor(Date.now() / 1000);

    if (stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const onToken = (msg) => {
        if (msg.text) {
          const chunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [{
              index: 0,
              delta: { content: msg.text },
              finish_reason: null
            }]
          };
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      };

       try {
        const finalResult = await pool.generate(model, prompt, modelOptions, onToken);
        recordRequest(finalResult.perf);
        
        const stopChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop'
          }],
          perf: finalResult.perf
        };
        reply.raw.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      } catch (err) {
        const errorChunk = {
          error: { message: err.message, type: 'invalid_request_error' }
        };
        reply.raw.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        reply.raw.end();
      }
      return reply;
    } else {
      let accumulatedText = "";
      const onToken = (msg) => {
        if (msg.text) accumulatedText += msg.text;
      };

      try {
        const finalResult = await pool.generate(model, prompt, modelOptions, onToken);
        recordRequest(finalResult.perf);
        return {
          id: completionId,
          object: 'chat.completion',
          created,
          model,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: accumulatedText },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: finalResult.perf?.prefill_tokens || 0,
            completion_tokens: finalResult.perf?.generate_tokens || 0,
            total_tokens: (finalResult.perf?.prefill_tokens || 0) + (finalResult.perf?.generate_tokens || 0)
          },
          perf: finalResult.perf
        };
      } catch (err) {
        return reply.status(500).send({ error: err.message });
      }
    }
  });

  // POST /v1/embeddings
  fastify.post('/embeddings', async (request, reply) => {
    const { model, input } = request.body || {};
    if (!input) {
      return reply.status(400).send({ error: "Missing required field 'input'" });
    }
    
    // Simple 1536-dimensional mock embedding vector
    const embedding = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
    
    return {
      object: 'list',
      data: [{
        object: 'embedding',
        index: 0,
        embedding
      }],
      model: model || 'mock-embedding-model',
      usage: {
        prompt_tokens: 0,
        total_tokens: 0
      }
    };
  });
}
