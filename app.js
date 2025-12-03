const logList = document.getElementById('log-list');
const form = document.querySelector('form');
const userInput = form.elements.user;
const messageInput = form.elements.message;

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const renderEntry = (entry) => {
  const listItem = document.createElement('li');
  listItem.className = 'entry incoming';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const meta = document.createElement('div');
  meta.className = 'meta';

  const userSpan = document.createElement('span');
  userSpan.className = 'user';
  userSpan.textContent = entry.user;

  const time = document.createElement('time');
  time.dateTime = entry.timestamp;
  time.textContent = formatTime(entry.timestamp);

  meta.append(userSpan, time);

  const messageParagraph = document.createElement('p');
  messageParagraph.className = 'message';
  messageParagraph.textContent = entry.message;

  bubble.append(meta, messageParagraph);
  listItem.appendChild(bubble);
  return listItem;
};

const populateEntries = async () => {
  try {
    const response = await fetch('/entries');
    if (!response.ok) throw new Error('Nie udało się pobrać wpisów.');
    const entries = await response.json();

    logList.innerHTML = '';
    entries.forEach((entry) => {
      logList.appendChild(renderEntry(entry));
    });
  } catch (err) {
    console.error(err);
  }
};

const submitEntry = async (event) => {
  event.preventDefault();
  const user = userInput.value.trim();
  const message = messageInput.value.trim();

  if (!user || !message) {
    return;
  }

  try {
    const response = await fetch('/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user, message }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Nie udało się zapisać wpisu.');
    }

    const entry = await response.json();
    logList.appendChild(renderEntry(entry));
    form.reset();
    messageInput.focus();
  } catch (err) {
    console.error(err);
  }
};

form.addEventListener('submit', submitEntry);

populateEntries();
