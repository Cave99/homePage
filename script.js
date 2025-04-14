import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "https://cdn.jsdelivr.net/npm/@google/generative-ai/+esm";

window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;

// --- API Keys and Configuration ---
const GEMINI_API_KEY = "AIzaSyDFvaklan-dgJ8vv6KyuvmgR6Sg63hQHZE";
const CHAT_MODEL_NAME = "gemini-2.0-flash";
const CLIENT_ID = "1012878751917-a2hooqj8ncvukajm2qa629516496s4oa.apps.googleusercontent.com";
const API_KEY = "YOUR_API_KEY";
const DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest";
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

// --- Global State Variables ---
let genAI;
let chatModel;
let chatSession;
let attachedFile = null;
let isAIResponding = false;
let isGroundingEnabled = true;
let isAIInitialized = false; // Track if AI has been initialized
const gradients = [
  "linear-gradient(45deg, #e91e63, #f06292)",
  "linear-gradient(45deg, #ff9800, #ffb74d)",
  "linear-gradient(45deg, #9c27b0, #ba68c8)",
  "linear-gradient(45deg, #4caf50, #81c784)",
  "linear-gradient(45deg, #2196f3, #64b5f6)",
  "linear-gradient(45deg, #00bcd4, #4dd0e1)",
  "linear-gradient(45deg, #f44336, #e57373)",
];
let timer,
  timeLeft,
  isTimerRunning = false,
  currentPhase = "work",
  cycleCount = 0;
let pomodoroSettings = {};
let todos = [];
let sortableInstance = null;
let notesSaveTimeout;
const AUTOSAVE_DELAY = 1500;
const INDENT_CHAR = "  ";
let gapiTokenClient;
let gapiInited = false;
let gisInited = false;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDate = null;
let monthlyEvents = {};

// --- DOM Element Selections (Move these outside DOMContentLoaded) ---
// Quick Links / Modal
const quickLinksBar = document.getElementById("quick-links-bar");
const addNewLinkBtn = document.getElementById("add-new-link-btn");
const addLinkModal = document.getElementById("add-link-modal");
const modalCloseBtn = document.getElementById("modal-close-btn");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const modalAddLinkBtn = document.getElementById("modal-add-link-btn");
const modalLinkUrl = document.getElementById("modal-link-url");
const modalLinkName = document.getElementById("modal-link-name");

// Pomodoro
const timerDisplay = document.getElementById("timer-display");
const startBtn = document.getElementById("start-timer");
const resetBtn = document.getElementById("reset-timer");
const settingsBtn = document.getElementById("settings-btn");
const saveSettingsBtn = document.getElementById("save-settings");
const settingsPanel = document.getElementById("pomodoro-settings");

// To-Do List
const todoInput = document.getElementById("todo-input");
const addTodoBtn = document.getElementById("add-todo");
const todoList = document.getElementById("todo-list");

// Notepad
const notesArea = document.getElementById("notes");

// Google Calendar / Auth
const gapiAuthorizeButton = document.getElementById("authorize_button");
const gapiSignoutButton = document.getElementById("signout_button");
const calendarContainer = document.getElementById("calendar-container");
const calendarAuthMessage = document.getElementById("calendar-auth-message");
const calendarGrid = document.getElementById("calendar-grid");
const monthYearDisplay = document.getElementById("month-year");
const prevMonthBtn = document.getElementById("prev-month");
const nextMonthBtn = document.getElementById("next-month");
const calendarEventsList = document.getElementById("calendar-events");
const selectedDateHeader = document.getElementById("selected-date-header");

// Daily Review
const reviewList = document.getElementById("review-list");
const filterButtons = document.querySelectorAll(".filters button");
const reviewKeywordInput = document.getElementById("review-filter-keyword");
const reviewFilterType = document.getElementById("review-filter-type");

// AI Chat
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendChatBtn = document.getElementById("send-chat-btn");
const attachFileBtn = document.getElementById("attach-file-btn");
const fileInput = document.getElementById("file-input");
const attachmentPreview = document.getElementById("chat-attachment-preview");
const previewImage = document.getElementById("preview-image");
const removeAttachmentBtn = document.getElementById("remove-attachment-btn");
const toggleGroundingBtn = document.getElementById("toggle-grounding-btn");


const aiOverviewBtn = document.getElementById("ai-overview-btn");
const aiOverviewContent = document.getElementById("ai-overview-content");
const standardReviewFilters = document.getElementById("standard-review-filters");
let isAIOverviewActive = false;


// --- Function Definitions ---
function loadLinks() {
  if (!quickLinksBar || !addNewLinkBtn) return; // Defensive check

  const links = JSON.parse(localStorage.getItem("links") || "[]");
  // Clear existing buttons except the "+ New" button
  quickLinksBar.querySelectorAll(".quick-link-btn").forEach((btn) => btn.remove());

  links.forEach((link, index) => {
    const btn = document.createElement("button");
    btn.className = "quick-link-btn";
    btn.style.background = gradients[index % gradients.length];
    btn.innerText = link.name;
    btn.onclick = () => window.open(link.url, "_blank");
    // Insert before the "+ New" button
    quickLinksBar.insertBefore(btn, addNewLinkBtn);
  });
}

function toggleGrounding() {
  if (!toggleGroundingBtn) return;

  isGroundingEnabled = !isGroundingEnabled; // Flip the state

  // Update button appearance and accessibility attributes
  if (isGroundingEnabled) {
    toggleGroundingBtn.classList.add("grounding-enabled");
    toggleGroundingBtn.setAttribute("aria-label", "Disable chat grounding (history/files)");
    toggleGroundingBtn.title = "Grounding Enabled (Uses History & Files)";
  } else {
    toggleGroundingBtn.classList.remove("grounding-enabled");
    toggleGroundingBtn.setAttribute("aria-label", "Enable chat grounding (history/files)");
    toggleGroundingBtn.title = "Grounding Disabled (Ignores History & Files)";
  }
  console.log("Grounding enabled:", isGroundingEnabled);
}


function openAddLinkModal() {
  modalLinkUrl.value = ""; // Clear fields
  modalLinkName.value = "";
  addLinkModal.style.display = "flex"; // Show modal
  modalLinkUrl.focus(); // Focus on first input
}

function closeAddLinkModal() {
  addLinkModal.style.display = "none"; // Hide modal
}

function addLinkFromModal() {
  const url = modalLinkUrl.value.trim();
  const name = modalLinkName.value.trim();

  if (!url || !name) {
    alert("Please enter both URL and Name.");
    return;
  }
  // Basic URL validation
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    alert("Please enter a valid URL starting with http:// or https://");
    return;
  }

  const links = JSON.parse(localStorage.getItem("links") || "[]");
  links.push({
    url,
    name
  });
  localStorage.setItem("links", JSON.stringify(links));
  loadLinks(); // Reload links in the bar
  closeAddLinkModal(); // Close modal after adding
}

function loadPomodoroSettings() {
  pomodoroSettings = JSON.parse(localStorage.getItem("pomodoroSettings") || "{}");
  pomodoroSettings.work = pomodoroSettings.work || 25;
  pomodoroSettings.shortBreak = pomodoroSettings.shortBreak || 5;
  pomodoroSettings.longBreak = pomodoroSettings.longBreak || 15;
  pomodoroSettings.cycles = pomodoroSettings.cycles || 4;

  document.getElementById("work-duration").value = pomodoroSettings.work;
  document.getElementById("short-break").value = pomodoroSettings.shortBreak;
  document.getElementById("long-break").value = pomodoroSettings.longBreak;
  document.getElementById("cycles").value = pomodoroSettings.cycles;
}

function savePomodoroSettings() {
  pomodoroSettings = {
    work: parseInt(document.getElementById("work-duration").value) || 25,
    shortBreak: parseInt(document.getElementById("short-break").value) || 5,
    longBreak: parseInt(document.getElementById("long-break").value) || 15,
    cycles: parseInt(document.getElementById("cycles").value) || 4,
  };
  localStorage.setItem("pomodoroSettings", JSON.stringify(pomodoroSettings));
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (timeLeft % 60).toString().padStart(2, "0");
  timerDisplay.textContent = `${minutes}:${seconds}`;
  document.title = `${minutes}:${seconds} - Productivity Hub`;
}

function startNextPhase() {
  clearInterval(timer);
  isTimerRunning = false;
  startBtn.textContent = "Start";

  if (currentPhase === "work") {
    cycleCount++;
    if (cycleCount % pomodoroSettings.cycles === 0) {
      currentPhase = "longBreak";
      timeLeft = pomodoroSettings.longBreak * 60;
      alert("Time for a long break!");
    } else {
      currentPhase = "shortBreak";
      timeLeft = pomodoroSettings.shortBreak * 60;
      alert("Time for a short break!");
    }
  } else {
    currentPhase = "work";
    timeLeft = pomodoroSettings.work * 60;
    alert("Back to work!");
  }
  updateTimerDisplay();
}

function startTimer() {
  if (isTimerRunning) return;
  isTimerRunning = true;
  startBtn.textContent = "Pause";
  timer = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      updateTimerDisplay();
    } else {
      startNextPhase();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timer);
  isTimerRunning = false;
  startBtn.textContent = "Resume";
}

function renderTodos() {
  todoList.innerHTML = "";
  todos.forEach((todo, index) => {
    const li = document.createElement("li");
    li.className = "todo-item" + (todo.completed ? " completed" : "");
    li.dataset.index = index;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.onchange = () => toggleTodo(index);
    const label = document.createElement("label");
    label.appendChild(checkbox);
    label.append(document.createTextNode(todo.text));
    const removeBtn = document.createElement("button");
    removeBtn.innerHTML = "&times;";
    removeBtn.className = "remove-todo";
    removeBtn.onclick = () => removeTodo(index);
    li.appendChild(label);
    li.appendChild(removeBtn);
    if (todo.isNew) {
      li.classList.add("adding");
      requestAnimationFrame(() => {
        li.classList.remove("adding");
      });
      delete todo.isNew;
    }
    todoList.appendChild(li);
  });
}

function loadTodos() {
  todos = JSON.parse(localStorage.getItem("todos") || "[]");
  renderTodos();
}

function saveTodos() {
  const todosToSave = todos.map(({
    isNew,
    ...rest
  }) => rest);
  localStorage.setItem("todos", JSON.stringify(todosToSave));
}

function addTodo() {
  const text = todoInput.value.trim();
  if (!text) return;
  todos.push({
    text,
    completed: false,
    isNew: true
  });
  saveTodos();
  renderTodos();
  todoInput.value = "";
  todoInput.focus();
}

function toggleTodo(index) {
  if (index < 0 || index >= todos.length) return;
  todos[index].completed = !todos[index].completed;
  saveTodos();
  const li = todoList.querySelector(`li[data-index="${index}"]`);
  if (li) {
    li.classList.toggle("completed", todos[index].completed);
  }
}

function removeTodo(index) {
  if (index < 0 || index >= todos.length) return;
  const liToRemove = todoList.querySelector(`li[data-index="${index}"]`);
  if (liToRemove) {
    liToRemove.classList.add("removing");
    liToRemove.addEventListener(
      "transitionend",
      () => {
        todos.splice(index, 1);
        saveTodos();
        loadTodos();
      }, {
        once: true
      }
    );
  } else {
    todos.splice(index, 1);
    saveTodos();
    loadTodos();
  }
}

function initializeSortable() {
  if (sortableInstance) {
    sortableInstance.destroy();
  }
  sortableInstance = Sortable.create(todoList, {
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    onEnd: function (evt) {
      const itemEl = evt.item;
      const newIndex = evt.newIndex;
      const oldIndex = evt.oldIndex;
      if (oldIndex !== newIndex) {
        const [movedItem] = todos.splice(oldIndex, 1);
        todos.splice(newIndex, 0, movedItem);
        saveTodos();
        renderTodos();
      }
    },
  });
}

function loadNotes() {
  notesArea.value = localStorage.getItem("notes") || "";
}

async function initializeAIChat() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_API_KEY_HERE") {
    addMessage("ai", "Error: API Key not configured in script.js", true);
    console.error("Gemini API Key not configured.");
    sendChatBtn.disabled = true; // Disable sending
    chatInput.disabled = true;
    attachFileBtn.disabled = true;
    return;
  }

  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    // Ensure the model name supports the tool. gemini-2.0-flash should.
    chatModel = genAI.getGenerativeModel({
      model: CHAT_MODEL_NAME
    });

    // --- Define Chat Options including the Google Search Tool ---
    const chatOptions = {
      history: [
        { role: "user", parts: [{ text: "You are a helpful productivity assistant with access to my calendar events. You can tell me about my upcoming events and schedule when I ask. The events data will be provided in the chat context." }] },
        { role: "model", parts: [{ text: "I understand that I have access to your calendar events and can help you manage your schedule. Feel free to ask me about your upcoming events or any other assistance you need." }] },
      ],
      generationConfig: {
        // Optional: Adjust generation parameters
        // maxOutputTokens: 200,
        // temperature: 0.7,
        // topP: 0.9,
        // topK: 40
      },
      // safetySettings: [ // Optional: Adjust safety settings if needed
      //   { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      //   { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      // ],

      // --- THIS IS THE NEW PART ---
      // Enable Google Search as a tool for the model to use when needed
      tools: [{
        googleSearch: {}
      }],
      // Note: For Gemini 1.5 models, you might use: tools: [{ googleSearchRetrieval: {} }]
      // But for gemini-2.0-flash, googleSearch is appropriate.
      // ---------------------------
    };

    // Format calendar events for context if available
    let calendarContext = '';
    if (monthlyEvents && Object.keys(monthlyEvents).length > 0) {
      const formattedEvents = Object.entries(monthlyEvents)
        .flatMap(([month, events]) => events)
        .map(event => {
          const start = event.start.dateTime || event.start.date;
          const startDate = new Date(start);
          const dateStr = startDate.toLocaleDateString('en-CA'); // YYYY-MM-DD
          const timeStr = event.start.dateTime
            ? startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            : 'All Day';
          return `${dateStr} ${timeStr} - ${event.summary || '(No Title)'}`;
        })
        .join('\n');
      
      if (formattedEvents) {
        calendarContext = `\n\nHere are your upcoming calendar events:\n${formattedEvents}`;
      }
    }

    // Add calendar context to initial message if available
    const initialMessage = calendarContext
      ? `You are a helpful productivity assistant with access to my calendar events. You can tell me about my upcoming events and schedule when I ask. Here is my current calendar data:${calendarContext}`
      : "You are a helpful productivity assistant.";

    // Update chat options with calendar context
    chatOptions.history = [
      { role: "user", parts: [{ text: initialMessage }] },
      { role: "model", parts: [{ text: "I understand and have access to your calendar information. I can help you manage your schedule and answer questions about your upcoming events. What would you like to know?" }] }
    ];

    // Start a new chat session with history AND the tool enabled
    chatSession = chatModel.startChat(chatOptions); // Pass the configured options

    console.log("AI Chat initialized successfully with Google Search tool and calendar context enabled.");
    return true; // Indicate successful initialization
  } catch (error) {
    console.error("Error initializing AI Chat:", error);
    // Check if the error is specifically about tool incompatibility
    if (error.message && error.message.includes("tool")) {
      addMessage("ai", `Error initializing AI: ${error.message}. The selected model might not support the Google Search tool.`, true);
    } else {
      addMessage("ai", `Error initializing AI: ${error.message}`, true);
    }
    sendChatBtn.disabled = true; // Disable sending on error
    chatInput.disabled = true;
    attachFileBtn.disabled = true;
  }
}


// --- Helper function to add messages to the chat UI ---
// --- Helper function to add messages to the chat UI ---
function addMessage(sender, content, isError = false) {
  const messageDiv = document.createElement("div");
  messageDiv.classList.add("message", sender);
  if (isError) {
    messageDiv.style.color = "#ff7f7f"; // Style errors differently
    messageDiv.style.background = "rgba(255, 127, 127, 0.1)";
  }

  // Simple check for image preview data in user messages
  if (
    sender === "user" &&
    typeof content === "object" &&
    content.text !== undefined
  ) {
    // Display text part - Use textContent for user text to prevent XSS
    const textNode = document.createTextNode(content.text + " ");
    messageDiv.appendChild(textNode);
    // Display image preview if it exists
    if (content.imagePreviewSrc) {
      const img = document.createElement("img");
      img.src = content.imagePreviewSrc;
      img.alt = "Attached image";
      img.classList.add("inline-preview");
      messageDiv.appendChild(img);
    }
  } else if (sender === "ai" && content === "...") {
    // Handle typing indicator specifically
    messageDiv.classList.add("typing");
    messageDiv.textContent = "AI is typing"; // Placeholder text
    messageDiv.dataset.typingId = Date.now(); // Unique ID for removal
  } else if (sender === "ai") {
    // *** MODIFICATION START ***
    // For AI responses, format the text and use innerHTML
    messageDiv.innerHTML = formatAIResponse(content);
    // *** MODIFICATION END ***
  } else {
    // For simple text (e.g., initial user message if not object)
    // Use textContent for safety
    messageDiv.textContent = content;
  }

  chatMessages.appendChild(messageDiv);
  // Smooth scroll to the bottom
  chatMessages.scrollTo({
    top: chatMessages.scrollHeight,
    behavior: "smooth"
  });
  return messageDiv; // Return the element for potential updates (like typing indicator)
}


// --- Function to handle sending message ---
// --- Function to handle sending message ---
async function handleSendMessage() {
  if (isAIResponding) return; // Don't send if AI is already working

  const text = chatInput.value.trim();

  // Initialize AI on first message if not already initialized
  if (!isAIInitialized) {
    isAIResponding = true;
    sendChatBtn.disabled = true;
    chatInput.disabled = true;
    attachFileBtn.disabled = true;
    toggleGroundingBtn.disabled = true;
    
    try {
      await initializeAIChat();
      isAIInitialized = true;
    } catch (error) {
      console.error("Failed to initialize AI chat:", error);
      addMessage("ai", "Failed to initialize AI chat. Please try again.", true);
      isAIResponding = false;
      sendChatBtn.disabled = false;
      chatInput.disabled = false;
      attachFileBtn.disabled = false;
      toggleGroundingBtn.disabled = false;
      return;
    }
  }
  // Check if a file is attached *before* potentially clearing it
  const fileIsAttached = attachedFile !== null;
  // Use the attached file data only if grounding is enabled
  const fileDataForApi = isGroundingEnabled ? attachedFile : null;

  // We need text OR (if grounding is enabled) a file
  if (!text && !fileDataForApi) {
    // If grounding is disabled, we only need text.
    if (!isGroundingEnabled) return;
    // If grounding is enabled, we need text OR fileData.
    if (isGroundingEnabled && !fileIsAttached) return; // Check if a file *was* attached
  }

  isAIResponding = true;
  sendChatBtn.disabled = true;
  chatInput.disabled = true;
  attachFileBtn.disabled = true;
  toggleGroundingBtn.disabled = true; // Disable toggle during response

  // --- Display User Message ---
  let userMessageContent = {};
  if (text) userMessageContent.text = text;
  // Show preview in user message only if a file was attached (even if grounding is off now)
  if (fileIsAttached && attachedFile) { // Double check attachedFile exists
    userMessageContent.imagePreviewSrc = `data:${attachedFile.mimeType};base64,${attachedFile.base64Data}`;
  }
  addMessage("user", userMessageContent);

  // Clear input and attachment *after* displaying user message
  chatInput.value = "";
  chatInput.style.height = "40px"; // Reset height
  const currentAttachedFile = attachedFile; // Keep a reference before clearing
  removeAttachment(); // Clear stored file and preview

  const typingIndicator = addMessage("ai", "..."); // Show typing indicator

  try {
    // --- Prepare API Request Parts ---
    const parts = [];
    if (text) {
      parts.push({
        text: text
      });
    }
    // IMPORTANT: Only add file part if grounding is ENABLED *and* a file was attached
    if (isGroundingEnabled && currentAttachedFile) {
      parts.push({
        inlineData: {
          data: currentAttachedFile.base64Data, // Use the actual attached file data
          mimeType: currentAttachedFile.mimeType,
        },
      });
    }

    // --- ALWAYS Use the Main Session ---
    // The session object handles history automatically.
    // The 'isGroundingEnabled' flag now only controls file inclusion in 'parts'.
    if (!chatSession) {
      throw new Error("Chat session is not initialized.");
    }
    console.log(`Sending message. Grounding (file inclusion) is ${isGroundingEnabled ? 'ENABLED' : 'DISABLED'}. Using main session.`);
    const resultStream = await chatSession.sendMessageStream(parts);

    // --- Process Stream ---
    let fullResponseText = "";
    let currentResponseDiv = typingIndicator;

    for await (const chunk of resultStream.stream) {
      try {
        const chunkText = chunk.text();
        fullResponseText += chunkText;

        if (currentResponseDiv.classList.contains("typing")) {
          // First chunk, remove typing indicator and set initial formatted content
          currentResponseDiv.classList.remove("typing");
          currentResponseDiv.innerHTML = formatAIResponse(fullResponseText); // Format the first chunk
        } else {
          // Subsequent chunks, update formatted content
          currentResponseDiv.innerHTML = formatAIResponse(fullResponseText); // Re-format the growing text
        }
        // 
        // Auto-scroll only if near the bottom to avoid jumping during reading
        if (chatMessages.scrollHeight - chatMessages.scrollTop <= chatMessages.clientHeight + 100) {
          chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: "auto"
          });
        }
      } catch (streamError) {
        console.error("Error processing stream chunk:", streamError);
        // Attempt to get feedback if available
        let blockReason = "Unknown stream error";
        if (chunk && chunk.promptFeedback && chunk.promptFeedback.blockReason) {
          blockReason = chunk.promptFeedback.blockReason;
          fullResponseText += `\n[Blocked due to: ${blockReason}]`;
          currentResponseDiv.style.color = "#ffcc00"; // Yellow for blocked
        } else {
          fullResponseText += "\n[Error processing response part]";
          currentResponseDiv.style.color = "#ff7f7f"; // Red for error
        }
        currentResponseDiv.textContent = formatAIResponse(fullResponseText);
      }
    }

    // Final cleanup for typing indicator
    if (currentResponseDiv.classList.contains("typing")) {
      // This case means no text chunks were received at all
      chatMessages.removeChild(currentResponseDiv);
      // If no text was received at all, add an error message
      if (!fullResponseText) {
        addMessage("ai", "An empty response was received from the AI.", true);
      }
    }
    // Ensure the final complete response is formatted (might be redundant but safe)
    else if (currentResponseDiv) {
      currentResponseDiv.innerHTML = formatAIResponse(fullResponseText);
    }

  } catch (error) {
    console.error("Error sending message to AI:", error);
    const typingElem = chatMessages.querySelector(".message.ai.typing");
    if (typingElem) chatMessages.removeChild(typingElem);
    // Provide more specific error if possible
    let errorMessage = `Error: ${error.message}`;
    if (error.message.includes("API key not valid")) {
      errorMessage = "Error: Invalid API Key. Please check your GEMINI_API_KEY.";
    } else if (error.message.includes("429")) {
      errorMessage = "Error: Rate limit exceeded. Please try again later.";
    }
    addMessage("ai", errorMessage, true);
  } finally {
    isAIResponding = false; // Re-enable sending
    sendChatBtn.disabled = false;
    chatInput.disabled = false;
    attachFileBtn.disabled = false;
    toggleGroundingBtn.disabled = false; // Re-enable toggle
    chatInput.focus();
  }
}

function escapeHtml(unsafe) {
  if (!unsafe) return ""; // Handle null or undefined input
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- Function to format AI response text with Markdown-like syntax ---
function formatAIResponse(text) {
  // Function to format AI response text with Markdown-like syntax
  if (!text) return ""; // Handle empty input

  let html = text;

  // 1. Code Blocks (```...```) - Process first to avoid formatting inside
  html = html.replace(
    /```([\s\S]*?)```/g,
    (match, codeContent) =>
    `<pre><code>${escapeHtml(codeContent.trim())}</code></pre>`
  );

  // Split into lines to handle lists and paragraphs correctly
  const lines = html.split("\n");
  let formattedHtml = "";
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip processing if line is inside a pre-formatted block already
    if (line.includes("<pre><code>")) {
      let preBlock = line;
      while (!preBlock.includes("</code></pre>") && i + 1 < lines.length) {
        i++;
        preBlock += "\n" + lines[i];
      }
      formattedHtml += preBlock;
      continue; // Move to the next line after the pre block
    }

    // 2. Bullet Points (- or * item) - Made regex slightly more robust
    const listItemMatch = line.match(/^\s*[-*]\s+(.*)/);
    if (listItemMatch) {
      let itemContent = listItemMatch[1];
      
      // Process the content before escaping HTML
      // Apply formatting to list items (before escaping)
      itemContent = applyTextFormatting(itemContent);
      
      if (!inList) {
        formattedHtml += "<ul>";
        inList = true;
      }
      formattedHtml += `<li>${itemContent}</li>`;
    } else {
      // If the line is not a list item, close the list if we were in one
      if (inList) {
        formattedHtml += "</ul>";
        inList = false;
      }

      // Process the line before escaping HTML
      line = applyTextFormatting(line);

      // Wrap non-empty, non-list lines in <p> tags for spacing, unless it's empty
      if (line.trim()) {
        formattedHtml += `<p>${line}</p>`;
      }
    }
  }

  // Close the list if the text ends with a list item
  if (inList) {
    formattedHtml += "</ul>";
  }

  // Replace standalone paragraphs containing only <pre><code> blocks
  formattedHtml = formattedHtml.replace(
    /<p>(<pre><code>[\s\S]*?<\/code><\/pre>)<\/p>/g,
    "$1"
  );

  return formattedHtml;
}

// Helper function to apply text formatting (bold, italic)
function applyTextFormatting(text) {
  if (!text) return "";
  
  // First escape any HTML to prevent injection
  let formatted = escapeHtml(text);
  
  // Then apply formatting
  // 1. Bold: Replace **text** with <strong>text</strong>
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  
  // 2. Italic: Replace _text_ with <em>text</em>
  formatted = formatted.replace(/_(.*?)_/g, "<em>$1</em>");
  
  // 3. Also support *text* for italic (alternative syntax)
  formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");
  
  return formatted;
}





function gapiLoaded() {
  gapi.load("client", initializeGapiClient);
}
async function initializeGapiClient() {
  try {
    await gapi.client.init({
      discoveryDocs: [DISCOVERY_DOC]
    });
    gapiInited = true;
    maybeEnableCalendar();
  } catch (error) {
    console.error("Error initializing GAPI client:", error);
    calendarAuthMessage.textContent = "Error initializing Google API.";
  }
}

function gisLoaded() {
  try {
    gapiTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: handleAuthResponse,
    });
    gisInited = true;
    maybeEnableCalendar();
  } catch (error) {
    console.error("Error initializing GIS client:", error);
    calendarAuthMessage.textContent = "Error initializing Google Sign-In.";
  }
}

function maybeEnableCalendar() {
  if (gapiInited && gisInited) {
    const token = gapi.client.getToken();

    if (token) {
      // Token exists in memory, update UI and fetch data
      console.log("Token already exists in GAPI client memory.");
      updateSigninStatus(true);
      fetchAndDisplayCalendarEvents();
    } else {
      // Try silent sign-in first
      console.log("No token in memory, attempting silent sign-in...");
      try {
        gapiTokenClient.requestAccessToken({
          prompt: "none",
          callback: (response) => {
            if (response.error === "interaction_required") {
              // Silent sign-in failed, show auth button
              console.log("Silent sign-in failed, user interaction required");
              updateSigninStatus(false);
            } else if (response.error) {
              console.error("Auth Error:", response.error);
              updateSigninStatus(false);
            } else {
              // Silent sign-in succeeded
              console.log("Silent sign-in successful");
              updateSigninStatus(true);
              fetchAndDisplayCalendarEvents();
            }
          }
        });
      } catch (error) {
        console.error("Error during silent sign-in:", error);
        updateSigninStatus(false);
      }
    }
  } else {
    console.log("GAPI or GIS not yet initialized.");
  }
}

function handleAuthResponse(resp) {
  if (resp.error) {
    console.error("Auth Error:", resp.error);
    calendarEventsList.innerHTML = `<li>Authorization failed: ${resp.error}</li>`;
    updateSigninStatus(false);
    return;
  }
  updateSigninStatus(true);
  fetchAndDisplayCalendarEvents();
}

function updateSigninStatus(isSignedIn) {
  if (isSignedIn) {
    gapiAuthorizeButton.style.display = "none";
    gapiSignoutButton.style.display = "inline-block";
    calendarContainer.style.display = "block";
    calendarAuthMessage.style.display = "none";
  } else {
    gapiAuthorizeButton.style.display = "inline-block";
    gapiSignoutButton.style.display = "none";
    calendarContainer.style.display = "none";
    calendarAuthMessage.style.display = "block";
    calendarAuthMessage.textContent = "Authorize to view calendar.";
    calendarGrid.innerHTML = "";
    calendarEventsList.innerHTML = "<li>Authorize to view events.</li>";
    selectedDateHeader.textContent = "Events";
  }
}

function generateCalendar(year, month) {
  calendarGrid.innerHTML = "";
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  monthYearDisplay.textContent = `${monthNames[month]} ${year}`;
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  for (let i = 0; i < firstDayOfMonth; i++) {
    const cell = document.createElement("div");
    cell.classList.add("calendar-day", "padding-day");
    calendarGrid.appendChild(cell);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.classList.add("calendar-day");
    cell.textContent = day;
    const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;
    cell.dataset.date = dateString;
    if (dateString === todayString) {
      cell.classList.add("current-day");
    }
    if (selectedDate === dateString) {
      cell.classList.add("selected-day");
    }
    if (monthlyEvents[dateString] && monthlyEvents[dateString].length > 0) {
      cell.classList.add("has-events");
      const dot = document.createElement("span");
      dot.classList.add("event-dot"); // Base dot style

      const eventsOnDay = monthlyEvents[dateString];
      const isDeadline = eventsOnDay.some(
        (event) => event.summary && event.summary.startsWith("🚨")
      );
      const isWork = eventsOnDay.some(
        (event) => event.summary && event.summary.startsWith("🐟")
      );

      if (isDeadline) {
        dot.classList.add("deadline"); // Red takes priority
      } else if (isWork) {
        dot.classList.add("work"); // Green if no deadline but is work
      }
      // Otherwise, it keeps the default blue color

      cell.appendChild(dot);
    }

    cell.addEventListener("click", () => handleDateClick(dateString, cell));
    calendarGrid.appendChild(cell);
  }
}

function handleDateClick(dateString, cellElement) {
  const prevSelected = calendarGrid.querySelector(".selected-day");
  if (prevSelected) {
    prevSelected.classList.remove("selected-day");
  }
  if (cellElement) {
    cellElement.classList.add("selected-day");
  }
  selectedDate = dateString;
  displayEventsForDate(dateString);
}

function displayEventsForDate(dateString) {
  calendarEventsList.innerHTML = "";
  const dateObj = new Date(dateString + "T00:00:00");
  selectedDateHeader.textContent = `Events for ${dateObj.toLocaleDateString(
      "en-AU"
    )}`;
  const events = monthlyEvents[dateString] || [];
  if (events.length === 0) {
    calendarEventsList.innerHTML = "<li>No events for this date.</li>";
    return;
  }
  events.sort((a, b) => {
    const aIsAllDay = !a.start.dateTime;
    const bIsAllDay = !b.start.dateTime;
    if (aIsAllDay && !bIsAllDay) return -1;
    if (!aIsAllDay && bIsAllDay) return 1;
    if (aIsAllDay && bIsAllDay) return 0;
    return new Date(a.start.dateTime) - new Date(b.start.dateTime);
  });
  events.forEach((event) => {
    const li = document.createElement("li");
    const startTime = event.start.dateTime ?
      new Date(event.start.dateTime).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }) :
      "All Day";
    li.textContent = `${startTime} - ${event.summary || "(No Title)"}`;
    calendarEventsList.appendChild(li);
  });
}
async function fetchAndDisplayCalendarEvents() {
  if (!gapi.client.getToken()) {
    console.log("Not authorized, skipping event fetch.");
    return;
  }
  console.log(`Fetching events for ${currentYear}-${currentMonth + 1}`);
  monthlyEvents = {};
  calendarGrid.innerHTML = "<div>Loading calendar...</div>";
  const timeMin = new Date(currentYear, currentMonth, 1).toISOString();
  const timeMax = new Date(currentYear, currentMonth + 1, 1).toISOString();
  try {
    const response = await gapi.client.calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin,
      timeMax: timeMax,
      showDeleted: false,
      singleEvents: true,
      maxResults: 250,
      orderBy: "startTime",
    });
    const events = response.result.items;
    if (events && events.length > 0) {
      events.forEach((event) => {
        const dateKey = (event.start.dateTime || event.start.date).substring(
          0,
          10
        );
        if (!monthlyEvents[dateKey]) {
          monthlyEvents[dateKey] = [];
        }
        monthlyEvents[dateKey].push(event);
      });
      localStorage.setItem("calendarEvents", JSON.stringify(events));
    } else {
      localStorage.setItem("calendarEvents", JSON.stringify([]));
    }
    generateCalendar(currentYear, currentMonth);
    const today = new Date();
    if (
      currentYear === today.getFullYear() &&
      currentMonth === today.getMonth()
    ) {
      const todayString = `${today.getFullYear()}-${String(
          today.getMonth() + 1
        ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const todayCell = calendarGrid.querySelector(
        `.calendar-day[data-date="${todayString}"]`
      );
      handleDateClick(todayString, todayCell);
    } else if (
      !selectedDate ||
      new Date(selectedDate).getMonth() !== currentMonth
    ) {
      selectedDate = null;
      calendarEventsList.innerHTML = "<li>Select a date to see events.</li>";
      selectedDateHeader.textContent = "Events";
    } else {
      const selectedCell = calendarGrid.querySelector(
        `.calendar-day[data-date="${selectedDate}"]`
      );
      if (selectedCell) selectedCell.classList.add("selected-day");
      displayEventsForDate(selectedDate);
    }
    loadDailyReview();
    console.log(`Also fetching next month's events for review buffer...`);
    let nextMonth = currentMonth + 1;
    let nextYear = currentYear;
    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear++;
    }
    const nextTimeMin = new Date(nextYear, nextMonth, 1).toISOString();
    const nextTimeMax = new Date(nextYear, nextMonth + 1, 1).toISOString();

    try {
      const nextResponse = await gapi.client.calendar.events.list({
        calendarId: "primary",
        timeMin: nextTimeMin,
        timeMax: nextTimeMax,
        showDeleted: false,
        singleEvents: true,
        maxResults: 250, // Adjust if needed
        orderBy: "startTime",
      });
      const nextEvents = nextResponse.result.items;
      if (nextEvents && nextEvents.length > 0) {
        localStorage.setItem("calendarEventsNextMonth", JSON.stringify(nextEvents));
        console.log(`Stored ${nextEvents.length} events for next month.`);
      } else {
        localStorage.setItem("calendarEventsNextMonth", JSON.stringify([])); // Store empty array if none
      }
    } catch (nextErr) {
      // Log error for next month fetch, but don't block main calendar display
      console.error("Error fetching NEXT month calendar events:", nextErr);
      // Optionally clear the next month storage on error
      localStorage.removeItem("calendarEventsNextMonth");
    }
  } catch (err) {
    console.error("Error fetching calendar events:", err);
    calendarGrid.innerHTML = "<div>Error loading calendar events.</div>";
    calendarEventsList.innerHTML = `<li>Error fetching events: ${
        err.result?.error?.message || err.message || "Unknown error"
      }</li>`;
    if (err.status === 401) {
      updateSigninStatus(false);
      calendarEventsList.innerHTML += "<li>Please try authorizing again.</li>";
    }
  }
}

function loadDailyReview() {
  const filterType = document.getElementById("review-filter-type").value;
  const activeButton = document.querySelector(".filters button.active");
  if (!activeButton) return;
  const daysFilter = parseInt(activeButton.dataset.filter);
  const keyword = reviewKeywordInput.value.trim().toLowerCase();
  const storedCurrentEvents = localStorage.getItem("calendarEvents");
  const storedNextEvents = localStorage.getItem("calendarEventsNextMonth"); // Get next month data

  if (
    (!storedCurrentEvents && !storedNextEvents) &&
    gapiAuthorizeButton.style.display !== "none"
  ) {
    reviewList.innerHTML = "<li>Authorize Calendar to see review.</li>";
    return;
  }

  const currentEvents = JSON.parse(storedCurrentEvents || "[]");
  const nextMonthEvents = JSON.parse(storedNextEvents || "[]"); // Parse next month data

  const allEvents = [...currentEvents, ...nextMonthEvents]; // Combine events from both months

  const now = new Date();
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  if (daysFilter === 0) {
    endDate.setHours(23, 59, 59, 999);
  } else {
    endDate.setDate(startDate.getDate() + daysFilter);
    endDate.setHours(23, 59, 59, 999);
  }

  if (isAIOverviewActive) {
    aiOverviewContent.style.display = "none";
    reviewList.style.display = "block"; // Show standard list
    standardReviewFilters.style.display = "block"; // Show standard filters
    aiOverviewBtn.classList.remove("active");
    isAIOverviewActive = false;
    // Ensure the correct standard filter button is active
    const currentStandardFilter = document.querySelector(".filters button.active[data-filter]");
    if (!currentStandardFilter) { // If no standard filter was active, default to week
      document.querySelector('.filters button[data-filter="7"]').classList.add('active');
    }
  }


  reviewList.innerHTML = "";
  let filteredEvents = allEvents.filter((event) => {
    const eventStartStr = event.start.dateTime || event.start.date;
    if (!eventStartStr) return false;
    const eventStartDate = new Date(eventStartStr);
    if (event.start.date) {
      const [year, month, day] = event.start.date.split("-").map(Number);
      eventStartDate.setUTCFullYear(year, month - 1, day);
      eventStartDate.setUTCHours(0, 0, 0, 0);
    }
    const isInDateRange =
      eventStartDate >= startDate && eventStartDate <= endDate;
    if (!isInDateRange) return false;
    if (keyword) {
      const summaryMatch =
        event.summary && event.summary.toLowerCase().includes(keyword);
      const descriptionMatch =
        event.description &&
        event.description.toLowerCase().includes(keyword);
      if (!summaryMatch && !descriptionMatch) {
        return false;
      }
    }
    const summary = event.summary || "";
    if (filterType === "deadline" && !summary.startsWith("🚨")) {
      return false; // Show only deadlines, this isn't one
    }
    if (filterType === "work" && !summary.startsWith("🐟")) {
      return false; // Show only work, this isn't one
    }
    return true;
  });
  filteredEvents.sort((a, b) => {
    const aDate = new Date(a.start.dateTime || a.start.date);
    const bDate = new Date(b.start.dateTime || b.start.date);
    if (a.start.date) aDate.setUTCHours(0, 0, 0, 0);
    if (b.start.date) bDate.setUTCHours(0, 0, 0, 0);
    return aDate - bDate;
  });
  if (filteredEvents.length === 0) {
    let message = "No events found";
    if (daysFilter === 0) message += " for today";
    else message += ` in the next ${daysFilter} days`;
    if (keyword) message += ` matching "${keyword}"`;
    message += ".";
    reviewList.innerHTML = `<li>${message}</li>`;
    return;
  }
  filteredEvents.forEach((event) => {
    const when = event.start.dateTime || event.start.date;
    const li = document.createElement("li");
    const eventDate = new Date(when);
    let displayDateStr = eventDate.toLocaleDateString("en-AU");
    if (event.start.date) {
      const [year, month, day] = event.start.date.split("-").map(Number);
      displayDateStr = new Date(year, month - 1, day).toLocaleDateString(
        "en-AU"
      );
    }
    const timeString = event.start.dateTime ?
      eventDate.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      }) :
      "All Day";
    // Clear existing content in case of re-renders (though usually list is cleared before)
    li.innerHTML = "";

    // Create span for the title
    const titleSpan = document.createElement("span");
    titleSpan.className = "event-title";
    // Add the emoji back if it exists
    const summary = event.summary || "(No Title)";
    if (summary.startsWith("🚨") || summary.startsWith("🐟")) {
      titleSpan.textContent = summary;
    } else {
      titleSpan.textContent = summary; // Or handle non-emoji cases if needed
    }

    // Create span for the date and time
    const dateTimeSpan = document.createElement("span");
    dateTimeSpan.className = "event-datetime";
    dateTimeSpan.textContent = `${displayDateStr} ${timeString}`;

    // Append spans to the list item
    li.appendChild(titleSpan);
    li.appendChild(dateTimeSpan);

    reviewList.appendChild(li);
  });
}

// --- Add Event Listeners for Chat ---
function setupChatEventListeners() {
  // --- Existing Listeners ---
  if (sendChatBtn) {
    sendChatBtn.addEventListener("click", handleSendMessage);
  } else {
    console.warn("Send chat button not found");
  }

  if (toggleGroundingBtn) {
    toggleGroundingBtn.addEventListener('click', toggleGrounding);
  } else {
    console.warn("Toggle grounding button not found");
  }

  if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
      // Send on Enter, but allow Shift+Enter for newline
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault(); // Prevent default newline behavior
        handleSendMessage();
      }
    });

    // Auto-resize textarea
    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto"; // Reset height
      chatInput.style.height = chatInput.scrollHeight + "px"; // Set to scroll height
    });

    // --- NEW: Add Paste Event Listener ---
    chatInput.addEventListener("paste", (event) => {
      const items = (event.clipboardData || window.clipboardData)?.items;
      if (!items) return;

      let foundImage = false;
      for (let i = 0; i < items.length; i++) {
        // Check if the item is a file and if it's an image
        if (items[i].kind === "file" && items[i].type.startsWith("image/")) {
          const imageFile = items[i].getAsFile();
          if (imageFile) {
            console.log("Image pasted:", imageFile.name, imageFile.type);
            processAndPreviewImageFile(imageFile); // Process the pasted image
            event.preventDefault(); // Prevent the default paste action (e.g., pasting file path as text)
            foundImage = true;
            break; // Process only the first image found
          }
        }
      }
      if (foundImage) {
        console.log("Image paste handled.");
      } else {
        console.log("Paste event did not contain a recognized image file.");
      }
    });
    // --- End of New Paste Listener ---
  } else {
    console.warn("Chat input not found");
  }

  if (attachFileBtn) {
    attachFileBtn.addEventListener("click", () => {
      if (fileInput) {
        fileInput.click(); // Trigger hidden file input
      } else {
        console.warn("File input element not found for attach button");
      }
    });
  } else {
    console.warn("Attach file button not found");
  }

  if (fileInput) {
    fileInput.addEventListener("change", handleFileSelect);
  } else {
    console.warn("File input element not found");
  }

  if (removeAttachmentBtn) {
    removeAttachmentBtn.addEventListener("click", removeAttachment);
  } else {
    console.warn("Remove attachment button not found");
  }
}

// --- Function to process and preview a selected/pasted image file ---
function processAndPreviewImageFile(file) {
  if (!file) return;

  // Basic validation (allow common image types)
  if (!file.type.startsWith("image/")) {
    addMessage("ai", "Error: Only image files are currently supported.", true);
    return; // Stop processing if not an image
  }

  // Optional: Add size limit (e.g., 4MB for Gemini Flash)
  const maxSizeMB = 4;
  if (file.size > maxSizeMB * 1024 * 1024) {
    addMessage("ai", `Error: File size exceeds ${maxSizeMB}MB limit.`, true);
    return; // Stop processing if too large
  }

  const reader = new FileReader();
  reader.onloadend = () => {
    // Store file data for sending
    attachedFile = {
      base64Data: reader.result.split(",")[1], // Get Base64 part
      mimeType: file.type,
      name: file.name || "pasted_image", // Use a default name for pasted files
    };
    // Show preview
    if (previewImage && attachmentPreview) {
      previewImage.src = reader.result;
      attachmentPreview.style.display = "block";
    } else {
      console.error("Preview elements not found!");
    }
  };
  reader.onerror = (error) => {
    console.error("FileReader error:", error);
    addMessage("ai", "Error reading the selected file.", true);
    removeAttachment(); // Clear any partial state
  };
  reader.readAsDataURL(file);
}

// --- Function to handle file selection ---
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    processAndPreviewImageFile(file); // Use the helper function
  }
  // Clear input value so same file can be re-selected if needed
  event.target.value = null;
}

// --- Function to remove attachment ---
function removeAttachment() {
  attachedFile = null;
  attachmentPreview.style.display = "none";
  previewImage.src = "#"; // Clear preview src
  fileInput.value = null; // Ensure file input is cleared
}


async function fetchEventsForAI(months = 2) {
  if (!gapi.client.getToken()) {
    console.log("Not authorized, skipping AI event fetch.");
    return null; // Indicate unauthorized or error
  }

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMaxDate = new Date(now);
  timeMaxDate.setMonth(timeMaxDate.getMonth() + months);
  const timeMax = timeMaxDate.toISOString();

  console.log(`AI Overview: Fetching events from ${timeMin} to ${timeMax}`);

  try {
    // Fetch events for the specified range
    const response = await gapi.client.calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin,
      timeMax: timeMax,
      showDeleted: false,
      singleEvents: true,
      maxResults: 100, // Limit results slightly for performance
      orderBy: "startTime",
    });
    const events = response.result.items;
    console.log(`AI Overview: Fetched ${events?.length || 0} events.`);
    return events || []; // Return events or empty array
  } catch (err) {
    console.error("Error fetching calendar events for AI:", err);
    // Handle specific errors like 401 if needed
    if (err.status === 401) {
      updateSigninStatus(false); // Update UI to show authorize button
    }
    return null; // Indicate error
  }
}

// --- NEW Function: Generate AI Overview ---
async function generateAIOverview() {
  if (!genAI || !chatModel) {
    aiOverviewContent.innerHTML = "<p>Error: AI Model not initialized.</p>";
    return;
  }
  if (!gapi.client.getToken()) {
    aiOverviewContent.innerHTML =
      "<p>Please authorize Google Calendar first.</p>";
    return;
  }

  isAIOverviewActive = true; // Set flag
    aiOverviewContent.innerHTML =
      "<p>Fetching events and generating overview...</p>"; // Loading message
    aiOverviewContent.style.display = "block"; // Show container
    reviewList.style.display = "none"; // Hide standard list
    standardReviewFilters.style.display = "none"; // Hide standard filters

    // 1. Fetch Events
    const events = await fetchEventsForAI(2); // Fetch next 2 months

    if (events === null) {
      aiOverviewContent.innerHTML =
        "<p>Could not fetch calendar events. Please ensure you are authorized or try again later.</p>";
      return;
    }

    // 2. Format Events for Prompt
    const formattedEvents = events
      .map((event) => {
        const start = event.start.dateTime || event.start.date;
        const startDate = new Date(start);
        const dateStr = startDate.toLocaleDateString("en-CA"); // YYYY-MM-DD
        const timeStr = event.start.dateTime
          ? startDate.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })
          : "All Day";
        return `${dateStr} ${timeStr} - ${event.summary || "(No Title)"}`;
      })
      .join("\n");

    // 3. Construct Prompt (REVISED FOR CLARITY AND COMPLIANCE)
    const prompt = `
IMPORTANT: Analyze the following calendar events for the next two months (current date: ${new Date().toLocaleDateString(
      "en-CA" // Use YYYY-MM-DD for clarity
    )}).
You MUST provide a response that includes ALL of the following headings, exactly as written (e.g., **Next 3 days:**).
Use bullet points (*) for lists under each heading where appropriate.
If a section has no specific items to list, you MUST use the exact default message specified for that section. Do NOT omit any sections.

**Next 3 days:**
*   List up to 3 important events or appointments happening today, tomorrow, and the day after. Do NOT exceed 3 events. Include date/time.
*   If no notable events are found in the next 3 days, you MUST state exactly: "* No notable events in the next 3 days."

**Next shift:**
*   Based on event names (like 'Work', 'Shift', 'On Call', etc.) or recurring patterns in the provided events, identify the date and time of the next likely work shift within the upcoming week.
*   If no work shifts are obvious in the upcoming week based on the data, you MUST state exactly: "* Next work shift not clearly identified in the upcoming week."

**Upcoming deadlines:**
*   List any events in the next two months that contain the deadline marker '🚨' in their summary. Include the date.
*   If no deadlines marked with '🚨' are found, you MUST state exactly: "* No upcoming deadlines found."

**Keep it fun:**
*   Suggest one brief, fun thing based on the schedule (like preparing for a fun event) or a general positive note/short activity suggestion (e.g., "Don't forget to take a short walk!").
*   If you cannot derive a specific suggestion, provide a simple positive message like: "* Remember to take a moment for yourself today!"

**Recommended tasks:**
*   Suggest 3-5 actionable tasks related to preparing for upcoming events (especially deadlines or meetings). Start each task with '* '.
*   If no specific tasks can be recommended based on the schedule, you MUST state exactly: "* No specific task recommendations based on the schedule."

Events Data:
\`\`\`
${events.length > 0 ? formattedEvents : "No events found in the calendar data."}
\`\`\`

Remember: Ensure ALL headings (**Next 3 days:**, **Next shift:**, **Upcoming deadlines:**, **Keep it fun:**, **Recommended tasks:**) are present in your response with appropriate content or the specified default message.
`;

    // 4. Call Gemini API
    try {
      const result = await chatModel.generateContent(prompt);
      const response = await result.response;
      const rawResponseText = response.text(); // Store raw text

      // *** Keep this for debugging ***
      console.log("--- Raw AI Overview Response ---");
      console.log(rawResponseText); // Log the raw text
      console.log("------------------------------");

      // 5. Parse and Display Response
      aiOverviewContent.innerHTML = ""; // Clear loading message

      // Helper function to extract content between headings or to the end (REVISED + LOGGING)
      const extractSection = (text, startHeading) => {
        //console.log(`[extractSection] Called for heading: "${startHeading}"`); // LOG 1
        const startIndex = text.indexOf(startHeading);
       // console.log(`[extractSection] startIndex: ${startIndex}`); // LOG 2

        if (startIndex === -1) {
            console.log(`[extractSection] Heading "${startHeading}" not found. Returning null.`); // LOG 3
            return null; // Heading not found
        }

        const searchStartIndex = startIndex + startHeading.length;
        //console.log(`[extractSection] searchStartIndex (after heading): ${searchStartIndex}`); // LOG 4

        const headingRegex = /^\s*\*\*(.*?)\*\*/gm;
        let match;
        let nextHeadingIndex = -1;
        headingRegex.lastIndex = 0; // Reset regex state IMPORTANT!

       // console.log(`[extractSection] Starting regex search for next heading after index ${searchStartIndex}`); // LOG 5
        while ((match = headingRegex.exec(text)) !== null) {
           // console.log(`[extractSection] Regex found potential heading: "${match[0]}" at index: ${match.index}`); // LOG 6
            // Ensure the match starts after the current heading's content begins
            if (match.index >= searchStartIndex) {
                 //console.log(`[extractSection]   -> This match is AFTER searchStartIndex. Setting nextHeadingIndex to ${match.index} and breaking.`); // LOG 7
                 nextHeadingIndex = match.index;
                 break; // Found the first one after, stop searching
            } else {
                 //console.log(`[extractSection]   -> This match is BEFORE searchStartIndex. Continuing search.`); // LOG 8
            }
            // Prevent infinite loops (shouldn't be needed with ^ but safe)
            if (headingRegex.lastIndex === match.index) {
                headingRegex.lastIndex++;
            }
        }

       // console.log(`[extractSection] Final nextHeadingIndex: ${nextHeadingIndex}`); // LOG 9

        let sectionTextRaw;
        let sectionTextTrimmed;
        if (nextHeadingIndex !== -1) {
            //console.log(`[extractSection] Extracting substring from ${searchStartIndex} to ${nextHeadingIndex}`); // LOG 10
            sectionTextRaw = text.substring(searchStartIndex, nextHeadingIndex);
            sectionTextTrimmed = sectionTextRaw.trim();
        } else {
            console.log(`[extractSection] No next heading found. Extracting substring from ${searchStartIndex} to end.`); // LOG 11
            sectionTextRaw = text.substring(searchStartIndex);
            sectionTextTrimmed = sectionTextRaw.trim();
        }

        //console.log(`[extractSection] Raw extracted text:\n---\n${sectionTextRaw}\n---`); // LOG 12
        //console.log(`[extractSection] Trimmed extracted text:\n---\n${sectionTextTrimmed}\n---`); // LOG 13
        //console.log(`[extractSection] Returning trimmed text for "${startHeading}".`); // LOG 14
        return sectionTextTrimmed;
      };

      // Define the headings we expect (matching the prompt)
      const headings = [
        "Next 3 days:",
        "Next shift:",
        "Upcoming deadlines:",
        "Keep it fun:",
        "Recommended tasks:",
      ];

      let sectionsDisplayed = 0; // Counter for displayed sections

      // Process each section
      headings.forEach((heading) => {
        //console.log(`\nProcessing heading: "${heading}" in main loop...`); // LOG A
        const sectionContent = extractSection(rawResponseText, `**${heading}**`); // Use raw text
       //console.log(`Result from extractSection for "${heading}":\n---\n${sectionContent}\n---`); // LOG B

        // Create the container and title REGARDLESS of content found
        const sectionDiv = document.createElement("div");
        sectionDiv.style.marginBottom = "1rem"; // Add space between sections

        const title = document.createElement("h4");
        title.textContent = heading;
        sectionDiv.appendChild(title);

        // Now, check if content was extracted for this heading
        if (sectionContent !== null && sectionContent !== "") {
          //console.log(` -> Content found for "${heading}". Proceeding with display.`); // LOG C
          sectionsDisplayed++; // Increment counter as we have content to show

          if (heading === "Recommended tasks:") {
            // ... (rest of task handling logic - no logging added here for brevity) ...
            const taskList = document.createElement("ul");
            const taskLines = sectionContent.trim().split("\n");
            let tasksFound = 0;
            //console.log(taskLines)
            taskLines.forEach((line) => {
              
              const taskTextMatch = line.match(/^\s*[*]\s*(.*)/);
              if (taskTextMatch) {
                const taskText = taskTextMatch[1].trim();
                if (taskText && taskText.length > 0) {
                  tasksFound++;
                  const li = document.createElement("li");
                  const span = document.createElement("span");
                  span.textContent = taskText;

                  const addButton = document.createElement("button");
                  addButton.textContent = "Add Task";
                  addButton.className = "add-task-ai-btn";
                  addButton.onclick = () => addTaskFromAI(taskText);

                  li.appendChild(span);
                  li.appendChild(addButton);
                  taskList.appendChild(li);
                } else {
                  console.log(
                    "AI Overview: Matched task bullet but text was empty:",
                    line
                  );
                }
              }
            });

            if (tasksFound > 0) {
              sectionDiv.appendChild(taskList);
            } else {
              const contentP = document.createElement("div");
              contentP.innerHTML = formatAIResponse(sectionContent);
              sectionDiv.appendChild(contentP);
            }
          } else {
            // For other sections, format the content directly
            const contentP = document.createElement("div");
            // *** IMPORTANT: Use the potentially multi-line sectionContent here ***
            contentP.innerHTML = formatAIResponse(sectionContent);
            sectionDiv.appendChild(contentP);
          }
          aiOverviewContent.appendChild(sectionDiv);
        } else if (sectionContent === null) {
          // Heading was NOT found in the response AT ALL
          console.warn(
            ` -> Heading "${heading}" was completely missing from the AI response.` // LOG D
          );
          const missingP = document.createElement("p");
          missingP.textContent = `(AI did not provide the "${heading}" section.)`;
          missingP.style.color = "#aaa";
          sectionDiv.appendChild(missingP);
          aiOverviewContent.appendChild(sectionDiv); // Still add the div with title and message
        } else {
          // Heading WAS found, but the content extracted was EMPTY ("")
          console.warn(
            ` -> Heading "${heading}" was found but had empty content after trimming.` // LOG E
          );
          const emptyP = document.createElement("p");
          emptyP.textContent = `(No specific information provided for "${heading}".)`;
          emptyP.style.color = "#aaa";
          sectionDiv.appendChild(emptyP);
          aiOverviewContent.appendChild(sectionDiv); // Still add the div with title and message
        }
      });

    // Add a fallback if NO sections were successfully displayed with content
    if (sectionsDisplayed === 0 && aiOverviewContent.children.length > 0) {
      // This case means headings might have been found, but all content was null/empty
      aiOverviewContent.innerHTML += // Append to existing messages
        "<p>Could not parse meaningful content from the AI response, although some structure might be present. The format might have changed or the AI failed to provide details.</p>";
      console.log("AI Response Text (Fallback Triggered):", text); // Log raw text
    } else if (aiOverviewContent.children.length === 0) {
      // This case means absolutely nothing was appended - likely extractSection failed repeatedly
      aiOverviewContent.innerHTML =
        "<p>Failed to parse any sections from the AI response. The format might be unexpected.</p>";
      console.log("AI Response Text (Complete Parse Failure):", text); // Log raw text
    }

  } catch (error) {
    console.error("Error generating AI Overview:", error);
    // Display error message, keeping potential partial content if error happened late
    const errorP = document.createElement("p");
    errorP.style.color = "#ff7f7f"; // Error color
    errorP.innerHTML = `<strong>Error generating AI overview:</strong> ${escapeHtml(error.message)}. Check console for details.`;
    aiOverviewContent.appendChild(errorP); // Append error message
  }
}


// --- NEW Helper Function: Add Task from AI Suggestion ---
function addTaskFromAI(taskText) {
  if (!todoInput || !addTodo) {
    console.error("Todo input or addTodo function not available.");
    return;
  }
  todoInput.value = taskText; // Set the text in the input field
  addTodo(); // Call the existing function to add it
  //console.log(`Added task from AI: "${taskText}"`);
}



document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed");


  // --- NOW Call Initialization and Setup Functions ---
  // (Make sure functions use the constants defined *above* within this scope,
  // or pass elements as arguments if functions are defined outside)

  // Quick Links
  if (quickLinksBar && addNewLinkBtn) {
    // Pass elements or rely on them being accessible if functions are defined within this scope
    loadLinks(); // Assumes loadLinks can access quickLinksBar, addNewLinkBtn, gradients
    addNewLinkBtn.onclick = openAddLinkModal; // Assumes openAddLinkModal accesses modal elements
    modalCloseBtn.onclick = closeAddLinkModal;
    modalCancelBtn.onclick = closeAddLinkModal;
    modalAddLinkBtn.onclick = addLinkFromModal;
    addLinkModal.addEventListener("click", (event) => {
      if (event.target === addLinkModal) {
        closeAddLinkModal();
      }
    });
    modalLinkName.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        addLinkFromModal();
      }
    });
  } else {
    console.error("Quick Links elements not found!");
  }

  // Pomodoro
  if (
    timerDisplay &&
    startBtn &&
    resetBtn &&
    settingsBtn &&
    saveSettingsBtn &&
    settingsPanel
  ) {
    loadPomodoroSettings(); // Assumes this sets values on input elements
    resetBtn.click(); // Initialize timer display

    // Define handlers here or ensure external functions have access
    startBtn.onclick = () => {
      if (!isTimerRunning && timeLeft > 0) {
        startTimer(); // Assumes startTimer accesses timer, timeLeft, startBtn etc.
      } else if (isTimerRunning) {
        pauseTimer(); // Assumes pauseTimer accesses timer, startBtn etc.
      } else {
        // Initial start
        currentPhase = "work";
        timeLeft = (pomodoroSettings.work || 25) * 60;
        updateTimerDisplay(); // Assumes updateTimerDisplay accesses timeLeft, timerDisplay
        startTimer();
      }
    };
    resetBtn.onclick = () => {
      clearInterval(timer);
      isTimerRunning = false;
      currentPhase = "work";
      cycleCount = 0;
      timeLeft = (pomodoroSettings.work || 25) * 60;
      updateTimerDisplay();
      startBtn.textContent = "Start";
      document.title = "Productivity Hub";
    };
    settingsBtn.onclick = () => {
      settingsPanel.style.display =
        settingsPanel.style.display === "none" ? "block" : "none";
    };
    saveSettingsBtn.onclick = () => {
      savePomodoroSettings(); // Assumes this reads from inputs and saves
      settingsPanel.style.display = "none";
      if (!isTimerRunning) {
        // Only reset if timer isn't running to apply new settings
        resetBtn.click();
      }
    };
  } else {
    console.error("Pomodoro elements not found!");
  }

  // To-Do List
  if (todoList && todoInput && addTodoBtn) {
    loadTodos(); // Assumes loadTodos accesses todos, todoList
    initializeSortable(); // Assumes initializeSortable accesses todoList, todos
    addTodoBtn.onclick = addTodo; // Assumes addTodo accesses todoInput, todos
    todoInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        addTodo();
      }
    });
  } else {
    console.error("Todo elements not found!");
  }

  // Notepad
  if (notesArea) {
    loadNotes();
    // Auto-save listener
    notesArea.addEventListener("input", () => {
      clearTimeout(notesSaveTimeout);
      notesSaveTimeout = setTimeout(() => {
        localStorage.setItem("notes", notesArea.value);
        //console.log("Notes auto-saved");
      }, AUTOSAVE_DELAY);
    });
    // List Functionality Listener
    notesArea.addEventListener("keydown", (e) => {
      // --- Paste the existing keydown logic for notes here ---
      // Make sure it uses the 'notesArea' constant defined in this scope
      const start = notesArea.selectionStart;
      const end = notesArea.selectionEnd;
      const value = notesArea.value;

      // Get current line information
      let lineStart = start;
      while (lineStart > 0 && value[lineStart - 1] !== "\n") {
        lineStart--;
      }
      let lineEnd = start;
      while (lineEnd < value.length && value[lineEnd] !== "\n") {
        lineEnd++;
      }
      const currentLine = value.substring(lineStart, lineEnd);
      const currentIndentMatch = currentLine.match(/^(\s*[-•*]?\s*)/); // Match leading space/bullet
      const currentIndent = currentIndentMatch ? currentIndentMatch[1] : "";
      const isListItem = currentIndent.trim().match(/^[-•*]/); // Check if it starts with a bullet

      // Handle '-' + ' ' for bullet points
      if (e.key === " " && value[start - 1] === "-") {
        // Check if it's already a list item to avoid double bullets
        if (
          !currentLine.trim().startsWith("- ") &&
          !currentLine.trim().startsWith("• ")
        ) {
          e.preventDefault();
          const indentBeforeDash = currentLine.match(/^(\s*)-/)?.[1] || "";
          notesArea.value =
            value.substring(0, start - 1) +
            indentBeforeDash +
            "• " +
            value.substring(start);
          notesArea.selectionStart = notesArea.selectionEnd =
            start + indentBeforeDash.length + 1; // Position after '• '
          notesArea.dispatchEvent(new Event("input")); // Trigger auto-save
          return;
        }
      }

      // Handle Enter key
      if (e.key === "Enter") {
        e.preventDefault();
        const lineTextAfterIndent = currentLine.substring(currentIndent.length);

        // If current line (after indent/bullet) is empty, decrease indent or remove bullet
        if (lineTextAfterIndent.trim() === "") {
          let newIndent = "";
          if (currentIndent.includes(INDENT_CHAR)) {
            // If indented
            newIndent = currentIndent.substring(
              0,
              currentIndent.lastIndexOf(INDENT_CHAR)
            );
            if (isListItem && !newIndent.trim().match(/^[-•*]/)) {
              // Ensure bullet remains if indent is removed but it was a list item
              newIndent += "• ";
            }
          } else if (isListItem) {
            // If it was a bullet point but not indented
            newIndent = ""; // Remove bullet
          } else {
            // Not a list item, just insert newline
            notesArea.value =
              value.substring(0, start) + "\n" + value.substring(end);
            notesArea.selectionStart = notesArea.selectionEnd = start + 1;
            notesArea.dispatchEvent(new Event("input"));
            return;
          }
          // Replace the current line content with the new indent level
          notesArea.value =
            value.substring(0, lineStart) +
            newIndent +
            value.substring(lineEnd);
          notesArea.selectionStart = notesArea.selectionEnd =
            lineStart + newIndent.length;
        } else {
          // If line is not empty, create new line with same indent
          const newBullet = isListItem ? "• " : ""; // Maintain bullet if it was a list item
          const indentToCarry =
            currentIndent.replace(/[-•*]\s*$/, "") + newBullet; // Keep spaces, add bullet if needed
          notesArea.value =
            value.substring(0, start) +
            "\n" +
            indentToCarry +
            value.substring(end);
          notesArea.selectionStart = notesArea.selectionEnd =
            start + 1 + indentToCarry.length;
        }
        notesArea.dispatchEvent(new Event("input")); // Trigger auto-save
        return;
      }

      // Handle Tab and Shift+Tab
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          // Outdent (Shift+Tab)
          if (currentIndent.startsWith(INDENT_CHAR)) {
            // Remove one level of indentation
            notesArea.value =
              value.substring(0, lineStart) +
              currentIndent.substring(INDENT_CHAR.length) +
              value.substring(lineStart + currentIndent.length);
            notesArea.selectionStart = notesArea.selectionEnd = Math.max(
              lineStart,
              start - INDENT_CHAR.length
            );
            notesArea.dispatchEvent(new Event("input"));
          } else if (isListItem && currentIndent.trim().length > 1) {
            // If it's a bullet with space but no indent char, remove the bullet formatting
            const nonBulletIndent = currentIndent.replace(/[-•*]\s*/, "");
            notesArea.value =
              value.substring(0, lineStart) +
              nonBulletIndent +
              value.substring(lineStart + currentIndent.length);
            notesArea.selectionStart = notesArea.selectionEnd = Math.max(
              lineStart,
              start - (currentIndent.length - nonBulletIndent.length)
            );
            notesArea.dispatchEvent(new Event("input"));
          }
        } else {
          // Indent (Tab)
          // Add one level of indentation
          notesArea.value =
            value.substring(0, lineStart) +
            INDENT_CHAR +
            value.substring(lineStart);
          notesArea.selectionStart = notesArea.selectionEnd =
            start + INDENT_CHAR.length;
          notesArea.dispatchEvent(new Event("input"));
        }
        return;
      }
      // --- End of pasted keydown logic ---
    });
  } else {
    console.error("Notepad element not found!");
  }

  // Google Calendar / Auth / Review (Listeners)
  // Note: gapiLoaded/gisLoaded handle the initial fetch calls via maybeEnableCalendar
  if (
    gapiAuthorizeButton &&
    gapiSignoutButton &&
    prevMonthBtn &&
    nextMonthBtn &&
    filterButtons && // Keep this for standard filters
    reviewKeywordInput &&
    reviewFilterType &&
    aiOverviewBtn && // Add the new button
    aiOverviewContent && // Add the new content area
    standardReviewFilters // Add the standard filters container
  ) {
    gapiAuthorizeButton.onclick = () => {
      if (!gapiInited || !gisInited) {
        console.error("API clients not ready.");
        alert("Google API clients are still loading. Please wait.");
        return;
      }
      if (gapiTokenClient) {
        gapiTokenClient.requestAccessToken({
          prompt: "consent",
          callback: handleAuthResponse
        });
      } else {
        console.error("gapiTokenClient not initialized!");
      }
    };
    gapiSignoutButton.onclick = () => {
      const token = gapi.client.getToken();
      if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token, () => {
          gapi.client.setToken("");
          updateSigninStatus(false); // Assumes this updates UI elements
          monthlyEvents = {};
          localStorage.removeItem("calendarEvents");
          localStorage.removeItem("calendarEventsNextMonth");
          loadDailyReview(); // Reload review (will show authorize message)
          // Also clear the calendar display explicitly on sign out
          if (calendarGrid) calendarGrid.innerHTML = "";
          if (calendarEventsList)
            calendarEventsList.innerHTML =
            "<li>Authorize to view events.</li>";
          if (selectedDateHeader) selectedDateHeader.textContent = "Events";
          if (monthYearDisplay) monthYearDisplay.textContent = "";
        });
      }
    };
    prevMonthBtn.onclick = () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      fetchAndDisplayCalendarEvents(); // Assumes this fetches and updates UI
    };
    nextMonthBtn.onclick = () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      fetchAndDisplayCalendarEvents();
    };

    filterButtons.forEach((btn) => {
      // Check if it's NOT the AI overview button
      if (btn.id !== 'ai-overview-btn') {
        btn.onclick = () => {
          // Deactivate ALL buttons first (including AI button)
          document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
          // Activate the clicked standard filter button
          btn.classList.add("active");

          // *** NEW: Ensure standard view is shown ***
          aiOverviewContent.style.display = "none";
          reviewList.style.display = "block";
          standardReviewFilters.style.display = "block";
          isAIOverviewActive = false;
          // *** END NEW ***

          loadDailyReview(); // Load standard review
        };
      }
    });



    reviewKeywordInput.addEventListener("input", loadDailyReview);
    reviewFilterType.addEventListener("change", loadDailyReview);
    if (aiOverviewBtn) {
      aiOverviewBtn.onclick = () => {
        // Deactivate ALL buttons first
        document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
        // Activate AI button
        aiOverviewBtn.classList.add("active");
        // Call the REFINED generation function
        generateAIOverview();
      };
    }
    // --- END Listener for AI Overview Button ---


    reviewKeywordInput.addEventListener("input", () => {
      // Only trigger standard load if AI view isn't active
      if (!isAIOverviewActive) loadDailyReview();
    });
    reviewFilterType.addEventListener("change", () => {
      // Only trigger standard load if AI view isn't active
      if (!isAIOverviewActive) loadDailyReview();
    });

    loadDailyReview(); // Initial load for review
  } else {
    console.error("Calendar/Review elements not found!");
  }



  // AI Chat
  if (
    chatMessages &&
    chatInput &&
    sendChatBtn &&
    attachFileBtn &&
    fileInput &&
    attachmentPreview &&
    previewImage &&
    removeAttachmentBtn
  ) {
    initializeAIChat().then(() => {
      // Assumes initializeAIChat sets up genAI, chatModel, chatSession and accesses UI elements
      setupChatEventListeners(); // Assumes this adds listeners using the constants defined in this scope
    });
  } else {
    console.warn("AI Chat elements not found, skipping initialization.");
  }

  console.log("All initializations inside DOMContentLoaded finished.");
}); // End of DOMContentLoaded listener