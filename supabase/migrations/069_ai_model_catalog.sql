-- 069_ai_model_catalog.sql
--
-- The models AutoShift can offer, the same list the app ships (src/lib/ai/catalog.ts). They start switched
-- on, but no provider is on until an admin saves an API key for it, so nothing is offered to businesses
-- until then. Re-running adds only models that are missing and never changes what an admin has set.
INSERT INTO platform_ai_models (vendor, model_id, label, tier, is_default) VALUES
  ('openai', 'gpt-6.1-sol', 'GPT-6.1 Sol', 'newest', FALSE),
  ('openai', 'gpt-6-luna', 'GPT-6 Luna', 'flagship', FALSE),
  ('openai', 'gpt-5.5', 'GPT-5.5', 'flagship', FALSE),
  ('openai', 'gpt-5.4', 'GPT-5.4', 'balanced', FALSE),
  ('openai', 'gpt-5.4-mini', 'GPT-5.4 Mini', 'fast', TRUE),
  ('openai', 'gpt-5.2', 'GPT-5.2', 'balanced', FALSE),
  ('openai', 'gpt-5-mini', 'GPT-5 Mini', 'fast', FALSE),
  ('openai', 'gpt-4.1', 'GPT-4.1', 'balanced', FALSE),
  ('openai', 'gpt-4.1-mini', 'GPT-4.1 Mini', 'fast', FALSE),
  ('openai', 'gpt-4o', 'GPT-4o', 'balanced', FALSE),
  ('openai', 'gpt-4o-mini', 'GPT-4o Mini', 'value', FALSE),
  ('google', 'gemini-3.8-flash', 'Gemini 3.8 Flash', 'newest', FALSE),
  ('google', 'gemini-3.6-flash', 'Gemini 3.6 Flash', 'balanced', FALSE),
  ('google', 'gemini-3.5-flash', 'Gemini 3.5 Flash', 'fast', FALSE),
  ('google', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 'value', FALSE),
  ('google', 'gemini-3.1-pro-preview', 'Pro 3.1 Preview', 'preview', FALSE),
  ('google', 'gemini-3.1-flash-lite', 'Flash 3.1 Lite', 'value', FALSE),
  ('google', 'gemini-3-flash-preview', 'Flash 3 Preview', 'preview', FALSE),
  ('anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', 'balanced', FALSE),
  ('anthropic', 'claude-opus-5-5', 'Claude Opus 5.5', 'flagship', FALSE),
  ('anthropic', 'claude-haiku-4-5', 'Claude Haiku 4.5', 'fast', FALSE),
  ('deepseek', 'deepseek-chat', 'DeepSeek Chat', 'value', FALSE),
  ('deepseek', 'deepseek-reasoner', 'DeepSeek Reasoner', 'reasoning', FALSE),
  ('deepinfra', 'llama-3.3-70b', 'Llama 3.3 70B', 'value', FALSE),
  ('deepinfra', 'qwen-2.5-72b', 'Qwen 2.5 72B', 'balanced', FALSE)
ON CONFLICT (vendor, model_id) DO NOTHING;
