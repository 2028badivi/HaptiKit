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

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = None
if GROQ_API_KEY:
    try:
        client = Groq(api_key=GROQ_API_KEY)
    except Exception as e:
        print(f"Groq Init Error: {e}")
else:
    print("Warning: GROQ_API_KEY not found. AI Assistant features will be disabled.")

model = YOLO('yolov8n.pt')

detection_state = {"object_detected": False, "detected_objects": []}
conversation_history = []

hand_landmarker = face_landmarker = None
try:
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    
    base_options_hands = python.BaseOptions(model_asset_path='models/hand_landmarker.task')
    options_hands = vision.HandLandmarkerOptions(base_options=base_options_hands, num_hands=1)
    hand_landmarker = vision.HandLandmarker.create_from_options(options_hands)

    base_options_face = python.BaseOptions(model_asset_path='models/face_landmarker.task')
    options_face = vision.FaceLandmarkerOptions(base_options=base_options_face, output_face_blendshapes=True)
    face_landmarker = vision.FaceLandmarker.create_from_options(options_face)
    print("MediaPipe Tasks API initialized successfully.")
except Exception as e:
    print(f"MediaPipe Tasks API Error: {e}")

def get_video_stream():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open camera.")
        return

    while True:
        success, frame = cap.read()
        if not success:
            break

        if frame.shape[1] > 1280:
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

        h, w, _ = annotated_frame.shape
        if hand_landmarker or face_landmarker:
            import mediapipe as mp
            rgb_frame = cv2.cvtColor(annotated_frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            
            if hand_landmarker:
                hand_res = hand_landmarker.detect(mp_image)
                if hand_res.hand_landmarks:
                    for hand_lms in hand_res.hand_landmarks:
                        for lm in hand_lms:
                            cv2.circle(annotated_frame, (int(lm.x * w), int(lm.y * h)), 2, (0, 255, 0), -1)
            
            if face_landmarker:
                face_res = face_landmarker.detect(mp_image)
                if face_res.face_landmarks:
                    mesh_coords = face_res.face_landmarks[0]
                    if len(mesh_coords) > 473:
                        li = mesh_coords[468] 
                        ri = mesh_coords[473]
                        eye_state["x"] = (li.x + ri.x) / 2
                        eye_state["y"] = (li.y + ri.y) / 2
                        
                        if face_res.face_blendshapes:
                            shapes = face_res.face_blendshapes[0]
                            eye_state["blink"] = shapes[9].score > 0.5 or shapes[10].score > 0.5
                        
                        cv2.circle(annotated_frame, (int(li.x * w), int(li.y * h)), 3, (0, 255, 255), -1)
                        cv2.circle(annotated_frame, (int(ri.x * w), int(ri.y * h)), 3, (0, 255, 255), -1)
        
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

SERIAL_PORT = '/dev/cu.usbmodem11201'
BAUD_RATE = 9600

joy_state = {"x": 0, "y": 0, "sw": 1, "dist": 0, "m": 1}
eye_state = {"x": 0.5, "y": 0.5, "blink": False}

def listen_to_arduino():
    while True:
        try:
            ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
            ser.dtr = False; time.sleep(0.1); ser.dtr = True 
            print(f"DEBUG: Listening at {BAUD_RATE} on {SERIAL_PORT}")
            
            while True:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                if line and "JS:" in line:
                    try:
                        parts = line.split("JS:")
                        raw_data = parts[-1].split(',')
                        if len(raw_data) >= 5:
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

threading.Thread(target=listen_to_arduino, daemon=True).start()

@app.route('/status')
def status():
    def generate():
        while True:
            current_state = {
                "joy": joy_state,
                "eye": eye_state,
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
