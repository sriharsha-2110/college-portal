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

    const system = `You are an expert academic content writer for Indian engineering colleges (VTU/JNTU/Anna University syllabus aligned).
You create comprehensive, exam-focused study notes that teachers can directly share with students.

FORMATTING RULES:
- Start with the topic title as a heading
- Add "Subject: ${subject || 'N/A'}" and "Semester: ${semester || 'N/A'}" and "Branch: ${branch || 'Engineering'}" metadata
- Structure notes into clear numbered sections
- Use bullet points for key concepts
- Include definitions, theorems, and formulas where relevant
- Add worked examples with step-by-step solutions
- Include diagrams described in text (e.g., "[Diagram: Binary Search Tree with nodes 50, 30, 70]")
- Add a "Key Points to Remember" section for quick revision
- Add a "Possible Exam Questions" section with 5-8 likely questions
- End with a brief summary

CONTENT RULES:
- Cover the topic thoroughly as per standard B.E/B.Tech syllabus
- Use simple, clear language suitable for undergraduate students
- Include real-world applications and analogies
- If the topic involves code, include clean code examples with comments
- If the topic involves math, show derivations step by step
- Mark important formulas with [IMPORTANT]
- Keep the content between 1500-2000 words for comprehensive coverage`;

    const messages = [{
      role: 'user',
      content: `Generate detailed academic notes based on this syllabus topic/prompt from the teacher:

"${topic}"

Subject: ${subject || 'Not specified'}
Semester: ${semester || 'Not specified'}  
Branch: ${branch || 'Not specified'}

Make the notes comprehensive, well-structured, and exam-ready. Follow the exact syllabus topic coverage that the teacher has described. If the teacher has pasted their syllabus module, cover all subtopics mentioned.`
    }];

    const content = await callClaude(system, messages, 3000);
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