// ===== AI MODULE =====

// ─── AI NOTES GENERATOR ─────────────────────────────────────────────────────

let aiGeneratedContent = '';
let aiPanelOpen = false;

function openAIGenerator() {
  const panel = document.getElementById('ai-generator-panel');
  if (panel) {
    panel.classList.remove('hidden');
    aiPanelOpen = true;
    document.getElementById('ai-topic').focus();
  }
}

function toggleAIPanel() {
  const body = document.getElementById('ai-gen-body');
  const btn = document.querySelector('.ai-gen-toggle');
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? '' : 'none';
  btn.textContent = isHidden ? 'Hide ▲' : 'Show ▼';
}

async function generateAINotes() {
  const topic = document.getElementById('ai-topic').value.trim();
  if (!topic) { showToast('Please describe the topic first.', 'error'); return; }

  const subject = document.getElementById('up-subject').value.trim();
  const semester = document.getElementById('up-semester').value;
  const branch = document.getElementById('up-branch').value;

  const btn = document.getElementById('ai-gen-btn');
  const status = document.getElementById('ai-gen-status');
  btn.disabled = true;
  btn.textContent = '⌛ Generating...';
  status.textContent = 'AI is writing your notes...';

  try {
    const res = await apiFetch('/ai/generate-notes', {
      method: 'POST',
      body: JSON.stringify({ topic, subject, semester, branch }),
    });

    if (res.ok) {
      aiGeneratedContent = res.data.content;
      document.getElementById('ai-gen-content').textContent = aiGeneratedContent;
      document.getElementById('ai-gen-preview').classList.remove('hidden');
      status.textContent = '✅ Notes generated!';
      showToast('Notes generated! Review and click Use These Notes.');
    } else {
      status.textContent = '❌ ' + (res.data.message || 'Generation failed.');
      showToast(res.data.message || 'Generation failed.', 'error');
    }
  } catch (err) {
    status.textContent = '❌ Server error.';
    showToast('AI generation failed. Check server.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Generate Notes';
  }
}

function useGeneratedNotes() {
  if (!aiGeneratedContent) return;

  // Auto-fill the upload form fields
  const topicLine = aiGeneratedContent.split('\n')[0].replace(/^#+\s*/, '').trim();

  if (!document.getElementById('up-title').value) {
    document.getElementById('up-title').value = topicLine.substring(0, 100);
  }
  if (!document.getElementById('up-desc').value) {
    document.getElementById('up-desc').value = 'AI-generated notes. ' + topicLine;
  }

  // Create a text file blob from the generated content
  const blob = new Blob([aiGeneratedContent], { type: 'text/plain' });
  const fileName = topicLine.substring(0, 40).replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_') + '_notes.txt';
  const file = new File([blob], fileName, { type: 'text/plain' });

  // Inject into the file input
  const dt = new DataTransfer();
  dt.items.add(file);
  document.getElementById('file-input').files = dt.files;
  handleFileSelect(document.getElementById('file-input'));

  showToast('Notes loaded into upload form! Fill in remaining fields and upload.');

  // Scroll to upload form
  document.querySelector('.upload-card').scrollIntoView({ behavior: 'smooth' });
}

// ─── AI CHATBOT ──────────────────────────────────────────────────────────────

let chatHistory = [];

function openChatbot() {
  document.getElementById('chatbot-modal').classList.remove('hidden');
  document.getElementById('chatbot-input').focus();
}

function closeChatbot() {
  document.getElementById('chatbot-modal').classList.add('hidden');
}

async function sendChatMessage() {
  const input = document.getElementById('chatbot-input');
  const message = input.value.trim();
  if (!message) return;

  appendChatMessage(message, 'user');
  input.value = '';
  chatHistory.push({ role: 'user', content: message });

  const typingEl = appendTypingIndicator();

  try {
    const user = Storage.getUser();
    const res = await apiFetch('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: chatHistory,
        subject: '',
        semester: user?.semester || '',
        branch: user?.branch || '',
      }),
    });

    typingEl.remove();

    if (res.ok) {
      const reply = res.data.reply;
      appendChatMessage(reply, 'ai');
      chatHistory.push({ role: 'assistant', content: reply });
    } else {
      appendChatMessage('Sorry, I could not answer that. Please try again.', 'ai');
    }
  } catch (err) {
    typingEl.remove();
    appendChatMessage('Connection error. Make sure the server is running.', 'ai');
  }
}

function appendChatMessage(text, sender) {
  const box = document.getElementById('chatbot-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${sender}`;
  div.innerHTML = `<div class="chat-bubble">${text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function appendTypingIndicator() {
  const box = document.getElementById('chatbot-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg ai typing';
  div.innerHTML = `<div class="chat-bubble"><span class="typing-dots"><span></span><span></span><span></span></span></div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}