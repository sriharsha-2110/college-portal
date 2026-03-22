const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

async function callClaude(systemPrompt, messages, maxTokens = 2000) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Claude API error');
  return data.content[0].text;
}

// POST /api/ai/generate-notes — Teacher only
router.post('/generate-notes', protect, authorize('teacher'), async (req, res) => {
  try {
    const { topic, subject, semester, branch } = req.body;
    if (!topic) return res.status(400).json({ success: false, message: 'Topic is required.' });

    const system = `You are an expert academic notes writer for engineering college students in India.
You write clear, structured, exam-focused notes.
Always format notes with:
- A brief introduction
- Key concepts with explanations
- Important points in bullet format
- Formulas or code examples where relevant
- A short summary at the end
Keep language simple and suitable for ${branch || 'engineering'} students in Semester ${semester || 'N'}.`;

    const messages = [{
      role: 'user',
      content: `Generate detailed academic notes on the topic: "${topic}" for subject: ${subject || 'General'}.
Make it comprehensive enough for exam preparation. Include examples where helpful.`
    }];

    const content = await callClaude(system, messages, 2000);
    res.json({ success: true, content });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/ai/chat — Student only
router.post('/chat', protect, async (req, res) => {
  try {
    const { messages, subject, semester, branch } = req.body;
    if (!messages || !messages.length) {
      return res.status(400).json({ success: false, message: 'Messages required.' });
    }

    const system = `You are a friendly and helpful academic study assistant for engineering college students.
The student is from ${branch || 'Engineering'} branch, Semester ${semester || 'N'}.
${subject ? `They are currently studying: ${subject}.` : ''}
- Answer questions clearly and concisely
- Use simple language suitable for students
- Give examples and analogies where helpful
- If asked about a topic outside academics, politely redirect to studies
- For numerical problems, show step-by-step solutions
- Keep responses focused and not too long`;

    const reply = await callClaude(system, messages, 1000);
    res.json({ success: true, reply });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;