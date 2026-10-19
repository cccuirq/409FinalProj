const message = document.querySelector('#message');
const status = document.querySelector('#status');
const retry = document.querySelector('#retry');

async function loadMessage() {
  retry.hidden = true;
  message.textContent = 'Loading…';
  status.textContent = 'Connecting to the API…';

  try {
    const response = await fetch('/api/hello', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (typeof data.message !== 'string') throw new Error('Invalid API response');
    message.textContent = data.message;
    status.textContent = 'Your frontend and backend are connected.';
  } catch (error) {
    console.error(error);
    message.textContent = 'Unable to connect';
    status.textContent = 'Please check that the server is running and try again.';
    retry.hidden = false;
  }
}

retry.addEventListener('click', loadMessage);
loadMessage();
