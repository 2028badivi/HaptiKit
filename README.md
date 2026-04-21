# HaptiKit Fruit Detector

A real-time computer vision project that detects fruits (apples, bananas, oranges) using YOLOv8 and provides interactive audio-visual feedback via a web interface.

## Features
- **Real-time Detection**: Uses YOLOv8 (Nano) for fast and accurate object classification.
- **Web Interface**: Professional dark-themed dashboard with live MJPEG stream.
- **Audio Feedback**: 
  - **YES**: High-pitched chime when a fruit is detected.
  - **NO**: Constant low-frequency throb when no fruit is present.
- **Video Recording**: Capture the live stream directly from your browser.
- **Robustness**: Handles camera errors and provides connection status indicators.

## Setup Instructions

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the Application**:
   ```bash
   python app.py
   ```

3. **Access the Dashboard**:
   Open your browser and go to `http://localhost:5001`.

4. **Enable Audio**:
   Click the **"Start Audio Engine"** button on the page to initialize the Web Audio context (required by browsers to prevent auto-playing sounds).

## How it Works
- **Backend**: Flask serves the video feed from OpenCV. Each frame is processed by YOLOv8, and detection results are sent via Server-Sent Events (SSE) to the frontend.
- **Frontend**: A `canvas` renders the MJPEG stream. The Web Audio API generates synthetic sounds in real-time based on the SSE status updates.
- **Recording**: The browser's `MediaRecorder` API captures the canvas stream and saves it as a `.webm` file.

## Target Objects
The system is currently configured to look for:
- Apples
- Bananas
- Oranges
- Broccoli
- Carrots
