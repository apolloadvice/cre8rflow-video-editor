# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/0d30b6cc-44a5-4e63-92e9-05c316abef90

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/0d30b6cc-44a5-4e63-92e9-05c316abef90) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Keyboard Shortcuts

The video editor supports the following keyboard shortcuts:

- **Undo**: Ctrl/Cmd + Z
- **Redo**: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
- **Delete selected clip**: Backspace or Delete

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/0d30b6cc-44a5-4e63-92e9-05c316abef90) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## 📝 How to Use Natural Language Video Editing Commands (AI-Powered)

You can now control the video editor using **free-form, natural language commands** in the chat panel. The system is powered by OpenAI's GPT-4 (or similar), so you can type instructions as you would describe them to a person.

### How It Works
- Type any edit instruction in your own words. The AI will interpret your intent and apply the edit to the timeline.
- The backend validates and applies the edit, and the UI updates instantly.
- If your command is ambiguous or cannot be understood, you'll receive a helpful error or feedback message.

### Examples of Supported Commands
- "Cut out the part where the guy in the grey quarter zip is talking."
- "Add title text from 10 to 15 that says 'Welcome to the channel'."
- "Overlay the logo from 5s to 10s."
- "Trim the first 5 seconds."
- "Remove the intro."
- "Add text 'Subscribe!' at the bottom from 00:20 to 00:25."

### Tips for Best Results
- Be as descriptive as you like—no need to follow a strict format.
- You can reference times, clip content, or describe what you want to change.
- If the system needs clarification, it will ask or provide feedback.
- Undo/redo and command history are supported for all edits.

### Error Handling & Feedback
- If the AI cannot interpret your command, you'll get a clear error or suggestion to rephrase.
- All errors are handled gracefully, and you are guided to clarify as needed.

### Deprecated: Rigid Command Syntax
- The old rigid command formats (e.g., `cut [first|last|clip N] clip at [time]`) are no longer required.
- You can now use natural language for all editing commands.

For more help, just type your question or ask for examples!

