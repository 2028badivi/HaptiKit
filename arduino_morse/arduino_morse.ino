const int buttonPin = 2;
unsigned long pressStartTime = 0;
bool isPressed = false;

void setup() {
  Serial.begin(9600);
  pinMode(buttonPin, INPUT_PULLUP);
}

void loop() {
  int buttonState = digitalRead(buttonPin);

  if (buttonState == LOW && !isPressed) { // if its pressed then it would start the time to count for morse decoding\
    pressStartTime = millis();
    isPressed = true;
    delay(50); // I need to debounce it here to prevent incorrect button HIGH/LOW reading
  } 
  else if (buttonState == HIGH && isPressed) { // stop the timer cuz it's released the button
    unsigned long duration = millis() - pressStartTime;
    
    // Dot woulld be: < 200ms, Dash: >= 200ms
    if (duration < 200) Serial.print(".");
    else Serial.print("-");
    
    isPressed = false;
  }

  // If button isnt  pressed for 800ms, then send a pipe to trigger translation
  if (buttonState == HIGH && !isPressed && millis() - pressStartTime > 800 && pressStartTime != 0) {
    Serial.println("|");
    pressStartTime = 0; // Reset now
  }
}
