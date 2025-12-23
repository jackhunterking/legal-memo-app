-- AI Configuration (tuneable parameters)
CREATE TABLE IF NOT EXISTS ai_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompt Templates (for LeMUR custom tasks)
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT DEFAULT 'anthropic/claude-3-5-sonnet',
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on config tables
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for Edge Functions)
CREATE POLICY "Service role can manage ai_config" ON ai_config
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage prompt_templates" ON prompt_templates
  FOR ALL USING (true) WITH CHECK (true);

-- Create trigger for updated_at on ai_config
CREATE TRIGGER ai_config_updated_at
  BEFORE UPDATE ON ai_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Create trigger for updated_at on prompt_templates
CREATE TRIGGER prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Default AssemblyAI config
INSERT INTO ai_config (key, value, description) VALUES
('assemblyai', '{
  "transcription": {
    "speaker_labels": true,
    "auto_chapters": true,
    "entity_detection": true,
    "language_code": "en"
  },
  "lemur": {
    "default_model": "anthropic/claude-3-5-sonnet",
    "summary_model": "anthropic/claude-3-5-sonnet",
    "tasks_model": "anthropic/claude-3-haiku",
    "analysis_model": "anthropic/claude-3-5-sonnet"
  }
}', 'AssemblyAI transcription and LeMUR configuration')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- Default legal analysis prompt
INSERT INTO prompt_templates (name, prompt, model) VALUES
('legal_analysis', 'You are a legal meeting analyst. Analyze this meeting transcript and provide a structured JSON response with:

1. meeting_overview: { one_sentence_summary, participants (with roles: LAWYER/CLIENT/OTHER), topics }
2. key_facts_stated: Array of { fact, stated_by, certainty: explicit/unclear }
3. legal_issues_discussed: Array of { issue, raised_by }
4. decisions_made: Array of { decision }
5. risks_or_concerns_raised: Array of { risk, raised_by }
6. follow_up_actions: Array of { action, owner, deadline }
7. open_questions: Array of { question, asked_by }

Identify speakers by their role based on context:
- LAWYER: Provides advice, asks clarifying questions, discusses legal strategy
- CLIENT: Describes their situation, asks for help, provides information
- OTHER: Third parties, witnesses, etc.

Be thorough and extract ALL relevant information. Even seemingly small details may be important for legal documentation.

IMPORTANT: Return ONLY valid JSON, no markdown formatting or explanation.', 'anthropic/claude-3-5-sonnet')
ON CONFLICT (name) DO UPDATE SET prompt = EXCLUDED.prompt, updated_at = NOW();

-- Task extraction prompt
INSERT INTO prompt_templates (name, prompt, model) VALUES
('task_extraction', 'Extract all actionable tasks from this meeting. For each task provide:
- title: Short, actionable description
- owner: Who should do it (LAWYER, CLIENT, or specific name if mentioned)
- priority: low/medium/high based on urgency indicators
- deadline: Suggested deadline if mentioned or implied, otherwise null

Return a JSON array of task objects.

IMPORTANT: Return ONLY valid JSON array, no markdown formatting or explanation.', 'anthropic/claude-3-haiku')
ON CONFLICT (name) DO UPDATE SET prompt = EXCLUDED.prompt, updated_at = NOW();

-- Summary context prompt
INSERT INTO prompt_templates (name, prompt, model) VALUES
('summary_context', 'This is a legal meeting between a lawyer/legal professional and their client. Focus on:
- Key legal matters discussed
- Decisions made
- Next steps agreed upon
- Important dates or deadlines mentioned

Provide a professional, concise summary suitable for legal documentation.', 'anthropic/claude-3-5-sonnet')
ON CONFLICT (name) DO UPDATE SET prompt = EXCLUDED.prompt, updated_at = NOW();

