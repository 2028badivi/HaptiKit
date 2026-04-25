// Global Cursor Position
let curX = window.innerWidth / 2;
let curY = window.innerHeight / 2;
let targetX = curX;
let targetY = curY;

// Sensitivity & Deadzone
const DEADZONE = 60; 
const LERP = 1.0; // Snappy movement (no gliding)
const SPEED_SCALE = 0.008;

const cursorEl = document.getElementById('cursor');
const distVal = document.getElementById('dist-val');
const objectsVal = document.getElementById('objects-val');
const joyVal = document.getElementById('joy-val');
const clockEl = document.getElementById('clock');
const morseDisplay = document.createElement('div');
morseDisplay.id = "morse-output";
morseDisplay.style.color = "green";
morseDisplay.style.fontSize = "1.5rem";

// Find HaptiKit AI body to append morse
setTimeout(() => {
    const aiBody = document.querySelector('#haptikit-ai-window .window-body');
    if (aiBody) aiBody.appendChild(morseDisplay);
}, 1000);

// Setup Clock
function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// Morse Decoding Logic
let morseBuffer = "";
let lastMorseState = 1; // 1 = released, 0 = pressed
let pressStartTime = 0;
let releaseStartTime = 0;

function handleMorse(state) {
    const now = Date.now();
    if (state === 0 && lastMorseState === 1) { // Pressed
        pressStartTime = now;
        releaseStartTime = 0;
    } else if (state === 1 && lastMorseState === 0) { // Released
        const duration = now - pressStartTime;
        if (duration < 250) morseBuffer += ".";
        else morseBuffer += "-";
        morseDisplay.textContent = morseBuffer;
    } else if (state === 1) { // Still released
        if (!releaseStartTime) releaseStartTime = now;
        if (now - releaseStartTime > 1000 && morseBuffer !== "") {
            morseBuffer += " "; // Word gap
            releaseStartTime = now;
        }
    }
    lastMorseState = state;
}

// Connect to the Python bridge
const eventSource = new EventSource('/status');

eventSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    const joy = data.joy;
    
    // 1. Update Labels
    if (distVal) distVal.textContent = joy.dist.toFixed(1);
    if (joyVal) joyVal.textContent = `${joy.x}, ${joy.y}`;
    if (objectsVal) {
        objectsVal.textContent = data.detected_objects.length > 0 ? data.detected_objects.join(', ') : "Searching...";
    }

    // 2. Handle Morse
    handleMorse(joy.m);

    // 3. Precise Analog Velocity (Direct & Smooth)
    const MOVE_SPEED = 0.02; // Scalar
    let dx = joy.x;
    let dy = joy.y;

    // Apply DEADZONE to stop drift
    if (Math.abs(dx) < 50) dx = 0;
    if (Math.abs(dy) < 50) dy = 0;

    // Push the cursor position (Acceleration based on tilt)
    targetX += dx * MOVE_SPEED;
    targetY += dy * MOVE_SPEED;

    // Clamp
    targetX = Math.max(0, Math.min(window.innerWidth, targetX));
    targetY = Math.max(0, Math.min(window.innerHeight, targetY));

    // Instant update
    curX = targetX;
    curY = targetY;

    cursorEl.style.left = `${curX}px`;
    cursorEl.style.top = `${curY}px`;

    // 4. Click
    if (joy.sw === 0) {
        cursorEl.classList.add('clicking');
        triggerClick(curX, curY);
    } else {
        cursorEl.classList.remove('clicking');
    }
};

let lastClickTime = 0;
function triggerClick(x, y) {
    const now = Date.now();
    if (now - lastClickTime < 500) return;
    lastClickTime = now;

    cursorEl.style.display = 'none';
    const target = document.elementFromPoint(x, y);
    cursorEl.style.display = 'block';

    if (target) {
        if (target.classList.contains('close-btn')) {
            target.closest('.window').style.display = 'none';
            return;
        }
        const icon = target.closest('.icon');
        if (icon) openWindow(icon.getAttribute('data-name'));
    }
}

function openWindow(name) {
    const winId = name.toLowerCase().replace(/\s+/g, '-') + '-window';
    const win = document.getElementById(winId);
    if (win) {
        win.style.display = 'block';
        win.style.zIndex = Math.floor(Date.now() / 1000); // Bring to front
    }
}

// ASL Fake Cycle (remains as a fallback, but MediaPipe does the visual heavy lifting)
const aslLetters = ["A", "B", "C", "L", "O", "V", "E"];
let aslIdx = 0;
setInterval(() => {
    const aslPred = document.getElementById('asl-pred');
    const aslWin = document.getElementById('asl-window');
    if (aslPred && aslWin && aslWin.style.display !== 'none') {
        aslPred.textContent = aslLetters[aslIdx];
        aslIdx = (aslIdx + 1) % aslLetters.length;
    }
}, 2000);
