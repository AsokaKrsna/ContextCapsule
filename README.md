# ContextCapsule

A powerful open-source Chrome extension that allows you to capture, manage, and inject conversation context across multiple AI platforms. ContextCapsule operates entirely locally, utilizing your own API keys (Groq, etc.) or local models (Ollama) to manage your context bridges seamlessly between **ChatGPT**, **Google Gemini**, **Claude.ai**, and **DeepSeek**.

## ✨ Features

- 🧠 **Universal AI Bridge**: Seamlessly move context between **ChatGPT**, **Google Gemini**, **Claude.ai**, and **DeepSeek**.
- 🔐 **Privacy First (BYOK & Local)**: No proprietary backends. All capsules are stored locally on your device via IndexedDB. Summarization uses your own API keys (e.g., Groq) or your local Ollama instance.
- 🎯 **Explicit Chat Transfer**: Capture a conversation into a structured capsule, then inject it intentionally into the next AI chat when you need to continue elsewhere.
- 💊 **The Magic Drop**: A revolutionary Drag & Drop workflow. Pick up a capsule and drop it directly into any chat box with a custom visual indicator.
- 📎 **Rich Attachment Context**: Support for capturing and injecting file types, including PDFs and Images natively into platforms.

## 🗂 How It Works

1. **Configure**: Enter your Groq API key or Ollama URL in the extension settings.
2. **Capture**: Open any supported conversation. Click the **Generate Capsule** button.
3. **The Library**: Switch to your target AI platform and open **Transfer Capsules**.
4. **Transfer**: Search for your capsule and either click **Inject Here** or drag the 💊 into the chat.
5. **Continue**: The target chat receives the handoff packet so you can keep working without rebuilding context manually.

## 📂 Project Structure

- **`manifest.json`**: Extension configuration (MV3) with cross-platform host permissions.
- **`popup.js` / `popup.html`**: UI logic featuring library management and API settings.
- **`background.js`**: Central service worker handling IndexedDB storage, capsule generation, and transfer packet assembly.
- **`content.js`**: Platform-aware orchestration script.

## 📦 Installation (Developer Mode)

1. Clone this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the project folder.
