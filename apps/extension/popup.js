const input = document.getElementById('apiBase')
const status = document.getElementById('status')

chrome.storage.local.get('apiBase').then(({ apiBase }) => {
  if (apiBase) input.value = apiBase
})

document.getElementById('save').addEventListener('click', async () => {
  const value = input.value.trim().replace(/\/$/, '')
  await chrome.storage.local.set({ apiBase: value })
  status.textContent = 'Saved ✓'
  setTimeout(() => (status.textContent = ''), 1500)
})
