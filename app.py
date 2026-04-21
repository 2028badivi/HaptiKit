import cv2
import json
import time
import os
from flask import Flask, render_template, Response, stream_with_context, request, jsonify
from ultralytics import YOLO
from groq import Groq

app = Flask(__name__)

# Groq API Configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY)

# Load YOLOv8 model
model = YOLO('yolov8n.pt')

# Target COCO classes (all)
# FRUIT_CLASSES = [46, 47, 49, 50, 51] # REMOVED

# Global state
detection_state = {"object_detected": False, "detected_objects": []}

def get_video_stream():
    """Generator for MJPEG video stream with digital pan/crop."""
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open camera.")
        return

    while True:
        success, frame = cap.read()
        if not success:
            break

        # EVEN TIGHTER SHIFT: Raw 1920x1080.
        # Original: x 0-960 (too far left/too much side).
        # New: x 100-1060 (shift center rightwards to get to true center).
        frame = frame[180:900, 100:1060]

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
morse_buffer = {"last_signal": ""}
conversation_history = []

def listen_to_arduino():
    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        print(f"DEBUG: Connected to {SERIAL_PORT}")
        while True:
            if ser.in_waiting > 0:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    # If it's a multi-character string (e.g., '..... |'), send it as individual chars
                    # Or just send the whole thing to the frontend for processing.
                    print(f"DEBUG: Passing raw line: '{line}'")
                    morse_buffer["last_signal"] = line
    except Exception as e:
        print(f"Serial Error: {e}")

# Start Arduino listener
threading.Thread(target=listen_to_arduino, daemon=True).start()

# ... existing code ...

@app.route('/status')
def status():
    def generate():
        while True:
            current_state = {
                "fruit_detected": detection_state["object_detected"],
                "detected_objects": detection_state["detected_objects"],
                "morse_signal": morse_buffer["last_signal"]
            }
            # Clear signal after reading
            morse_buffer["last_signal"] = ""
            current_state_json = json.dumps(current_state)
            yield f"data: {current_state_json}\n\n"
            time.sleep(0.1)
    return Response(stream_with_context(generate()), 
                    mimetype='text/event-stream')

@app.route('/chat', methods=['POST'])
def chat():
    global conversation_history
    user_message = request.json.get('message', '')
    conversation_history.append({"role": "user", "content": user_message})
    
    detected_str = ", ".join(detection_state["detected_objects"]) if detection_state["detected_objects"] else "nothing"
    system_prompt = f"Direct HaptiKit assistant. Objects: {detected_str}. Respond under 15 words. Concise, no fluff."

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
    app.run(host='0.0.0.0', port=5001, debug=False)
