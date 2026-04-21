const int buttonPin = 2;
unsigned long pressStartTime = 0;
bool isPressed = false;

void setup() {
  Serial.begin(9600);
  pinMode(buttonPin, INPUT_PULLUP);
}

void loop() {
  int buttonState = digitalRead(buttonPin);

  if (buttonState == LOW && !isPressed) { // Pressed
    pressStartTime = millis();
    isPressed = true;
    delay(50); // Debounce
  } 
  else if (buttonState == HIGH && isPressed) { // Released
    unsigned long duration = millis() - pressStartTime;
    
    // Dot: < 200ms, Dash: >= 200ms
    if (duration < 200) Serial.print(".");
    else Serial.print("-");
    
    isPressed = false;
  }

  // If button not pressed for 800ms, send a pipe to trigger translation
  if (buttonState == HIGH && !isPressed && millis() - pressStartTime > 800 && pressStartTime != 0) {
    Serial.println("|");
    pressStartTime = 0; // Reset
  }
}
