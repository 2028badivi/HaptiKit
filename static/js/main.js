// Chat Logic
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat');
const chatMessages = document.getElementById('chat-messages');

function addChatMessage(role, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.textContent = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    addChatMessage('user', message);
    chatInput.value = '';
    sendChatBtn.disabled = true;

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        const data = await response.json();
        addChatMessage('ai', data.response || "Error getting AI response.");
    } catch (e) {
        addChatMessage('ai', "Error connecting to AI.");
    } finally {
        sendChatBtn.disabled = false;
    }
}

sendChatBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(); });

// Web Audio API Context
let audioCtx;
let yesOsc;
let noOsc;
let yesGain;
let noGain;

// UI Elements
const statusIndicator = document.getElementById('connection-status');
const mainStatusBox = document.getElementById('main-status-box');
const mainStatusText = document.getElementById('main-status-text');
const detectionOverlay = document.getElementById('detection-overlay');
const detectionText = document.getElementById('detection-text');
const detectedList = document.getElementById('detected-list');
const audioBtn = document.getElementById('start-audio');
const recordBtn = document.getElementById('record-btn');
const canvas = document.getElementById('video-canvas');
const ctx = canvas.getContext('2d');

// State
let isFruitDetected = false;
let isAudioInitialized = false;
let mediaRecorder;
let recordedChunks = [];
let imgStream = new Image();
imgStream.src = '/video_feed'; // Same source as the MJPEG endpoint

// Draw MJPEG to Canvas
function draw() {
    if (imgStream.complete && imgStream.naturalWidth !== 0) {
        if (canvas.width !== imgStream.naturalWidth) {
            canvas.width = imgStream.naturalWidth;
            canvas.height = imgStream.naturalHeight;
        }
        ctx.drawImage(imgStream, 0, 0);
    }
    requestAnimationFrame(draw);
}
draw();

// Initialize Audio
function initAudio() {
    if (isAudioInitialized) return;
    
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Setup YES sound (High chime)
    yesOsc = audioCtx.createOscillator();
    yesGain = audioCtx.createGain();
    yesOsc.type = 'sine';
    yesOsc.frequency.setValueAtTime(880, audioCtx.currentTime);
    yesGain.gain.setValueAtTime(0, audioCtx.currentTime);
    yesOsc.connect(yesGain);
    yesGain.connect(audioCtx.destination);
    yesOsc.start();

    // Setup NO sound (Low pulse)
    noOsc = audioCtx.createOscillator();
    noGain = audioCtx.createGain();
    noOsc.type = 'square';
    noOsc.frequency.setValueAtTime(60, audioCtx.currentTime);
    noGain.gain.setValueAtTime(0, audioCtx.currentTime);
    noOsc.connect(noGain);
    noGain.connect(audioCtx.destination);
    noOsc.start();

    isAudioInitialized = true;
    audioBtn.textContent = "Audio Engine Running";
    audioBtn.classList.remove('primary');
    audioBtn.classList.add('secondary');
    audioBtn.disabled = true;
}

// Update UI and Sounds based on status
function updateState(data) {
    const detected = data.fruit_detected;
    const objects = data.detected_objects;

    // Visual Updates
    if (detected) {
        mainStatusBox.classList.replace('no', 'yes');
        mainStatusText.textContent = "YES";
        detectionOverlay.classList.replace('no', 'yes');
        detectionText.textContent = "FRUIT DETECTED";
    } else {
        mainStatusBox.classList.replace('yes', 'no');
        mainStatusText.textContent = "NO";
        detectionOverlay.classList.replace('yes', 'no');
        detectionText.textContent = "NOT DETECTED";
    }

    // List Update
    detectedList.innerHTML = objects.map(obj => `<li>${obj}</li>`).join('');

    // Audio Updates
    if (isAudioInitialized) {
        if (detected) {
            // YES Sound: Fast ping
            yesGain.gain.setTargetAtTime(0.2, audioCtx.currentTime, 0.05);
            noGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
        } else {
            // NO Sound: Constant low pulse
            yesGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
            // Throbbing effect for "No"
            const throb = Math.sin(Date.now() / 100) * 0.02 + 0.05;
            noGain.gain.setTargetAtTime(throb, audioCtx.currentTime, 0.05);
        }
    }
}

// SSE Connection
const eventSource = new EventSource('/status');

eventSource.onopen = () => {
    statusIndicator.textContent = "Connected";
    statusIndicator.classList.replace('offline', 'online');
};

eventSource.onerror = () => {
    statusIndicator.textContent = "Disconnected";
    statusIndicator.classList.replace('online', 'offline');
};

// Morse Code Mapping
const morseTable = {
    '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F', '--.': 'G', '....': 'H',
    '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P',
    '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X',
    '-.--': 'Y', '--..': 'Z'
};

let currentMorse = "";
let lastSignalTime = Date.now();

eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    updateState(data);

    if (data.morse_signal) {
        const line = data.morse_signal.trim();
        console.log("Raw Signal Line:", line);
        
        // Split line into dots/dashes by ignoring everything that is not a dot or dash,
        // unless it's a '|', which we use as a trigger.
        for (let char of line) {
            if (char === '.' || char === '-') {
                currentMorse += char;
                lastSignalTime = Date.now();
            } else if (char === '|') {
                console.log("Attempting translation of sequence:", currentMorse);
                if (currentMorse in morseTable) {
                    chatInput.value += morseTable[currentMorse];
                    console.log("SUCCESS! Added:", morseTable[currentMorse]);
                } else {
                    console.log("IGNORED invalid sequence:", currentMorse);
                }
                currentMorse = ""; 
            }
        }
    }
};

// Auto-translate if pause is detected
setInterval(() => {
    if (currentMorse && (Date.now() - lastSignalTime > 1500)) {
        if (currentMorse in morseTable) {
            chatInput.value += morseTable[currentMorse];
        }
        currentMorse = "";
    }
}, 500);

// Event Listeners
audioBtn.addEventListener('click', initAudio);

recordBtn.addEventListener('click', () => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        startRecording();
    } else {
        stopRecording();
    }
});

function startRecording() {
    recordedChunks = [];
    const stream = canvas.captureStream(30); // 30 FPS
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `detection_${Date.now()}.webm`;
        a.click();
    };

    mediaRecorder.start();
    recordBtn.textContent = "Stop Recording";
    recordBtn.style.background = "#ef4444";
}

function stopRecording() {
    mediaRecorder.stop();
    recordBtn.textContent = "Start Recording";
    recordBtn.style.background = "";
}
