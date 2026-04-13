function initVoiceInput(targetTextarea) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('btn-voice');
  const status = document.getElementById('voice-status');

  if (!SpeechRecognition) {
    btn.style.display = 'none';
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  let isListening = false;

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        final += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    if (final) {
      targetTextarea.value += final;
    }
    status.textContent = interim ? `识别中: ${interim}` : '';
    status.classList.toggle('hidden', !interim);
  };

  recognition.onerror = () => {
    stopListening();
    status.textContent = '语音识别出错，请重试';
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 2000);
  };

  recognition.onend = () => {
    if (isListening) {
      // Auto-restart if still supposed to be listening
      try { recognition.start(); } catch (_) { /* ignore */ }
    }
  };

  function startListening() {
    try {
      recognition.start();
      isListening = true;
      btn.classList.add('listening');
      status.textContent = '正在听...';
      status.classList.remove('hidden');
    } catch (_) { /* already started */ }
  }

  function stopListening() {
    isListening = false;
    recognition.stop();
    btn.classList.remove('listening');
    status.classList.add('hidden');
  }

  btn.addEventListener('click', () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  });

  return { startListening, stopListening };
}
