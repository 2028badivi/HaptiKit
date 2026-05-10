# HaptiKit OS 2.0

The first-ever remote to control your entire `operating system` (Haptic Interface) using `voice`, `eyes`, `hands`, and `haptics`. This haptic interface is meant to simulate Windows 95, and complete control of the computer to link multiple assistive technologies together into a cohesive unit.

HaptiKit AI: A simple application embedded into the HaptiKit OS that accurately spots daily assistive technology objects in real-time and uses sound and haptics to give you feedback. You can use the remote to send morse code to the AI to ask it to describe the environment around you, and it will respond in morse code through buzzing and vibrations.

### Some Important Features
* **Object Detection**: Instantly identifies common objects around you.
* **Audio Feedback**: Plays a chime when an object is detected and a low hum when an object is not detected.
* **Easy Recording**: Capture and save your live stream with one click.

### Quick Start
1. **Setup**: `pip install -r requirements.txt`
2. **Run**: `python app.py`
3. **Open**: Go to `http://localhost:5001` in your browser.
4. **Arduino**: Upload the .ino scripts to your Arduino.
5. **Wiring**: Complete the wiring for the remote (coming soon).
6. **Activate**: Click **"Start Audio Engine"** to hear the sounds.

### Functionality & Under the Hood
**Flask** and **YOLOv8** handle the object detection and processing on the backend.
**HaptiKit** uses **MediaPipe** for hand and eye tracking.
**HaptiKit** uses **Grok API** to describe the objects and send it to the user in the form of morse code vibrations and sounds.
**Flask** is used to link analog readings from the joystick to the Graphical User Interface (GUI).
**Eye-Tracking** for OS navigation (blinking to click). (alternative to joystick)