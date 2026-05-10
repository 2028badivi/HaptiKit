let currentMode = null;
let isCalibrating = false;
let eyeCalibration = {
    topLeft: {x: 0, y: 0},
    topRight: {x: 1, y: 0},
    bottomLeft: {x: 0, y: 1},
    bottomRight: {x: 1, y: 1}
};
let calibrationStep = 0;
const calibrationPoints = [
    {x: 0.1, y: 0.1, label: "Top-Left"},
    {x: 0.9, y: 0.1, label: "Top-Right"},
    {x: 0.1, y: 0.9, label: "Bottom-Left"},
    {x: 0.9, y: 0.9, label: "Bottom-Right"},
    {x: 0.5, y: 0.5, label: "Center"}
];

document.getElementById('mode-joystick').onclick = () => startApp('joystick');
document.getElementById('mode-eye').onclick = () => startApp('eye');

function startApp(mode) {
    currentMode = mode;
    document.body.classList.remove('show-selection');
    document.getElementById('selection-modal').style.display = 'none';
    
    if (mode === 'eye') {
        startCalibration();
    }
}

function startCalibration() {
    isCalibrating = true;
    calibrationStep = 0;
    const overlay = document.getElementById('calibration-overlay');
    overlay.style.display = 'block';
    nextCalibrationStep();
}

function nextCalibrationStep() {
    if (calibrationStep >= calibrationPoints.length) {
        finishCalibration();
        return;
    }
    
    const point = calibrationPoints[calibrationStep];
    const dot = document.getElementById('calibration-dot');
    dot.style.left = `${point.x * 100}%`;
    dot.style.top = `${point.y * 100}%`;
    document.getElementById('calibration-text').innerHTML = `Look at the dot: <b>${point.label}</b><br>Capturing...`;
    
    setTimeout(() => {
        calibrationStep++;
        nextCalibrationStep();
    }, 2000);
}

function finishCalibration() {
    isCalibrating = false;
    document.getElementById('calibration-overlay').style.display = 'none';
    console.log("Calibration complete");
}

let curX = window.innerWidth / 2;
let curY = window.innerHeight / 2;
let targetX = curX;
let targetY = curY;

const DEADZONE = 60; 
const LERP = 1.0; 
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

setTimeout(() => {
    const aiBody = document.querySelector('#haptikit-ai-window .window-body');
    if (aiBody) aiBody.appendChild(morseDisplay);
}, 1000);

function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

let morseBuffer = "";
let lastMorseState = 1; 
let pressStartTime = 0;
let releaseStartTime = 0;

function handleMorse(state) {
    const now = Date.now();
    if (state === 0 && lastMorseState === 1) {
        pressStartTime = now;
        releaseStartTime = 0;
    } else if (state === 1 && lastMorseState === 0) {
        const duration = now - pressStartTime;
        if (duration < 250) morseBuffer += ".";
        else morseBuffer += "-";
        morseDisplay.textContent = morseBuffer;
    } else if (state === 1) {
        if (!releaseStartTime) releaseStartTime = now;
        if (now - releaseStartTime > 1000 && morseBuffer !== "") {
            morseBuffer += " ";
            releaseStartTime = now;
        }
    }
    lastMorseState = state;
}

const eventSource = new EventSource('/status');

let eyeHistoryX = [];
let eyeHistoryY = [];
const EYE_SMOOTHING = 5;

eventSource.onmessage = function(event) {
    if (!currentMode) return;

    const data = JSON.parse(event.data);
    const joy = data.joy;
    const eye = data.eye;
    
    if (distVal) distVal.textContent = joy.dist.toFixed(1);
    if (joyVal) joyVal.textContent = `${joy.x}, ${joy.y}`;
    if (objectsVal) {
        objectsVal.textContent = data.detected_objects.length > 0 ? data.detected_objects.join(', ') : "Searching...";
    }

    handleMorse(joy.m);

    if (currentMode === 'joystick') {
        const MOVE_SPEED = 0.02;
        let dx = joy.x;
        let dy = joy.y;

        if (Math.abs(dx) < 50) dx = 0;
        if (Math.abs(dy) < 50) dy = 0;

        targetX += dx * MOVE_SPEED;
        targetY += dy * MOVE_SPEED;
    } else if (currentMode === 'eye' && !isCalibrating) {
        eyeHistoryX.push(eye.x);
        eyeHistoryY.push(eye.y);
        if (eyeHistoryX.length > EYE_SMOOTHING) {
            eyeHistoryX.shift();
            eyeHistoryY.shift();
        }
        
        const avgX = eyeHistoryX.reduce((a, b) => a + b) / eyeHistoryX.length;
        const avgY = eyeHistoryY.reduce((a, b) => a + b) / eyeHistoryY.length;

        targetX = (1 - avgX) * window.innerWidth;
        targetY = avgY * window.innerHeight;

        if (eye.blink) {
            cursorEl.classList.add('clicking');
            triggerClick(curX, curY);
        } else {
            cursorEl.classList.remove('clicking');
        }
    }

    targetX = Math.max(0, Math.min(window.innerWidth, targetX));
    targetY = Math.max(0, Math.min(window.innerHeight, targetY));

    curX = targetX;
    curY = targetY;

    cursorEl.style.left = `${curX}px`;
    cursorEl.style.top = `${curY}px`;

    if (currentMode === 'joystick') {
        if (joy.sw === 0) {
            cursorEl.classList.add('clicking');
            triggerClick(curX, curY);
        } else {
            cursorEl.classList.remove('clicking');
        }
    }
};

let lastClickTime = 0;
function triggerClick(x, y) {
    const now = Date.now();
    if (now - lastClickTime < 800) return;
    lastClickTime = now;

    cursorEl.style.display = 'none';
    const target = document.elementFromPoint(x, y);
    cursorEl.style.display = 'block';

    if (target) {
        if (target.classList.contains('close-btn')) {
            target.closest('.window').style.display = 'none';
            return;
        }
        if (target.id === 'start-btn') {
             alert("HaptiKit OS v1.0 - Built with ❤️");
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
        win.style.zIndex = Math.floor(Date.now() / 1000); 
    }
}

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
