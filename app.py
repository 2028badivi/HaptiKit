import cv2
import json
import time
import os
from flask import Flask, render_template, Response, stream_with_context, request, jsonify
from ultralytics import YOLO
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Groq API Configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = None
if GROQ_API_KEY:
    try:
        client = Groq(api_key=GROQ_API_KEY)
    except Exception as e:
        print(f"Groq Init Error: {e}")
else:
    print("Warning: GROQ_API_KEY not found. AI Assistant features will be disabled.")

# Load YOLOv8 model
model = YOLO('yolov8n.pt')

# Global state
detection_state = {"object_detected": False, "detected_objects": []}
conversation_history = []

# MediaPipe Hands Setup (with fallback)
hands = mp_hands = mp_draw = None
try:
    import mediapipe as mp
    import mediapipe.solutions.hands as mp_hands
    import mediapipe.solutions.drawing_utils as mp_draw
    hands = mp_hands.Hands(static_image_mode=False, max_num_hands=1, min_detection_confidence=0.5)
except Exception as e:
    print(f"MediaPipe Load Error: {e}")

def get_video_stream():
    """Generator for MJPEG video stream with YOLO and Hand Tracking."""
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open camera.")
        return

    while True:
        success, frame = cap.read()
        if not success:
            break

        # Zoom/Crop logic if high-res
        if frame.shape[1] > 1280:
            frame = frame[180:900, 100:1060]

        # YOLO Detection
        results = model.predict(frame, conf=0.4, verbose=False)
        current_objects = []
        object_found = False
        
        annotated_frame = results[0].plot()
        
        for box in results[0].boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            object_found = True
            label = results[0].names[cls_id]
            current_objects.append(f"{label} ({conf:.2f})")

        detection_state["object_detected"] = object_found
        detection_state["detected_objects"] = current_objects

        # MediaPipe Hand Tracking (Overlay on the already annotated YOLO frame)
        if hands:
            rgb_frame = cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB)
            hand_results = hands.process(rgb_frame)
            if hand_results.multi_hand_landmarks:
                for hand_lms in hand_results.multi_hand_landmarks:
                    mp_draw.draw_landmarks(annotated_frame, hand_lms, mp_hands.HAND_CONNECTIONS)
        
        ret, buffer = cv2.imencode('.jpg', annotated_frame)
        frame_bytes = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

    cap.release()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(get_video_stream(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

import threading
import serial

# Serial Configuration
SERIAL_PORT = '/dev/cu.usbmodem11201'
BAUD_RATE = 9600


# Global buffer for joystick and sensor data
joy_state = {"x": 0, "y": 0, "sw": 1, "dist": 0, "m": 1}

def listen_to_arduino():
    while True:
        try:
            ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
            # Standard reset sequence
            ser.dtr = False; time.sleep(0.1); ser.dtr = True 
            print(f"DEBUG: Listening at {BAUD_RATE} on {SERIAL_PORT}")
            
            while True:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line and "JS:" in line:
                    try:
                        # Extract the data after the JS: tag
                        parts = line.split("JS:")
                        raw_data = parts[-1].split(',')
                        if len(raw_data) >= 5:
                            # Your data shows center around 504, 527. 
                            # We offset from 512 for standard feel.
                            joy_state["x"] = int(raw_data[0]) - 504
                            joy_state["y"] = int(raw_data[1]) - 527
                            joy_state["sw"] = int(raw_data[2])
                            joy_state["dist"] = float(raw_data[3])
                            joy_state["m"] = int(raw_data[4])
                    except Exception:
                        pass
        except Exception as e:
            print(f"SERIAL ERROR: {e}")
            time.sleep(1)

# Start Arduino listener
threading.Thread(target=listen_to_arduino, daemon=True).start()


@app.route('/status')
def status():
    def generate():
        while True:
            current_state = {
                "joy": joy_state,
                "fruit_detected": detection_state["object_detected"],
                "detected_objects": detection_state["detected_objects"]
            }
            yield f"data: {json.dumps(current_state)}\n\n"
            time.sleep(0.02)
    return Response(stream_with_context(generate()), 
                    mimetype='text/event-stream')

@app.route('/chat', methods=['POST'])
def chat():
    global conversation_history
    user_message = request.json.get('message', '')
    conversation_history.append({"role": "user", "content": user_message})
    
    detected_str = ", ".join(detection_state["detected_objects"]) if detection_state["detected_objects"] else "nothing"
    system_prompt = f"Direct HaptiKit assistant. Objects: {detected_str}. Respond under 15 words. Concise, no fluff."

    if not client:
        return jsonify({"response": "I'm offline (No API key found). But the joystick is working!"})

    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system_prompt}] + conversation_history[-10:],
            temperature=0.7,
            max_tokens=150
        )
        response_text = completion.choices[0].message.content
        conversation_history.append({"role": "assistant", "content": response_text})
        return jsonify({"response": response_text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=False)
