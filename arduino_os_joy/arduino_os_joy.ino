#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Servo.h>
#include <avr/wdt.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

float normalized_output_potentiometer = 1.0;

unsigned long recordTime = 0;
unsigned long startTime;

const int POT_PIN = A0;

// RGB LED Pins
const int RED_PIN = 3;
const int GREEN_PIN = 11;   // moved from 10 to 11
const int BLUE_PIN = 5;

// Button Pins
const int RED_BUTTON = 6;
const int GREEN_BUTTON = 7;
const int BLUE_BUTTON = 8;

// Buzzer Pin
const int BUZZER_PIN = 9;

Servo myservo;

void updatePotentiometer() {

  int potValue = analogRead(POT_PIN);

  // Serial.println(potValue);

  normalized_output_potentiometer =
      constrain(potValue, 0, 1023) / 1023.0;
}

void checkForReset() {

  if (normalized_output_potentiometer < 0.25) {
    fakePowerOff();
  }

  //   Serial.println("POT BELOW THRESHOLD -> RESET");

  //   lcd.clear();
  //   lcd.setCursor(0, 0);
  //   lcd.print("System Reset");

  //   delay(200);

  //   wdt_enable(WDTO_15MS);

  //   while (true) {
  //     // wait for watchdog reset
  //   }
  // }
}


void fakePowerOff() {

  // Turn everything off
  setColor(255,255,255);

  noTone(BUZZER_PIN);

  myservo.detach();

  lcd.noBacklight();
  lcd.clear();

  // Infinite sleep-like state
  while (true) {

    updatePotentiometer();

    // Wake condition
    if (normalized_output_potentiometer > 0.20) {

      wdt_enable(WDTO_15MS);

      while (true);
    }
  }
}


float getPotScale() {

  // Map 0.25 → 0.0
  // Map 1.00 → 1.0

  float scale =
      (normalized_output_potentiometer - 0.25) / 0.75;

  return constrain(scale, 0.0, 1.0);
}

int scaleBrightness(int pwmValue) {

  float scale = getPotScale();

  // COMMON ANODE inversion logic

  int brightness =
      255 - ((255 - pwmValue) * scale);

  return constrain(brightness, 0, 255);
}


void spinServo() {

  // Re-attach in case detached earlier
  myservo.attach(2);

  myservo.write(180);

  delay(800);

  myservo.write(90);

  delay(500);

  // Stop sending holding pulses
  myservo.detach();
}



// RGB LED Helper Function
void setColor(int redValue, int greenValue, int blueValue) {

  analogWrite(
      RED_PIN,
      scaleBrightness(redValue));

  analogWrite(
      GREEN_PIN,
      scaleBrightness(greenValue));

  analogWrite(
      BLUE_PIN,
      scaleBrightness(blueValue));
}

void setup() {

  // BUTTONS
  pinMode(RED_BUTTON, INPUT_PULLUP);
  pinMode(GREEN_BUTTON, INPUT_PULLUP);
  pinMode(BLUE_BUTTON, INPUT_PULLUP);

  // RGB LED
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);

  // BUZZER
  pinMode(BUZZER_PIN, OUTPUT);

  Serial.begin(9600);

  randomSeed(analogRead(A1));

  // SERVO
  myservo.attach(2);

  Serial.println("=== SYSTEM START ===");

  // LCD SETUP
  lcd.init();
  lcd.backlight();

  lcd.setCursor(0, 0);
  lcd.print("Simon Game");

  lcd.setCursor(0, 1);
  lcd.print("Starting...");

  delay(1200);

  lcd.clear();
}

void loop() {

  updatePotentiometer();
  checkForReset();

  Serial.println("\n--- NEW GAME ---");

  startTime = millis();

  run10();

  unsigned long elapsedTime = millis() - startTime;

  recordTime = max(recordTime, elapsedTime);

  Serial.print("GAME FINISHED | TIME: ");
  Serial.println(elapsedTime);

  delay(2000);
}

void run10() {

  int seq[10];

  for (int level = 1; level <= 5; level++) {

    updatePotentiometer();
    checkForReset();

    Serial.print("\n>>> LEVEL ");
    Serial.println(level);

    update(level, millis() - startTime);

    // Generate sequence
    for (int i = 0; i < level; i++) {

      seq[i] = random(1, 4);
    }

    Serial.print("SEQUENCE: ");

    for (int i = 0; i < level; i++) {

      Serial.print(seq[i]);
      Serial.print(" ");
    }

    Serial.println();

    bool levelComplete = false;

    // Repeat same level until correct
    while (!levelComplete) {

      updatePotentiometer();
      checkForReset();

      levelComplete = run(level, seq);
    }
  }
}

bool run(int level, int seq[]) {

  Serial.println("[STATE] PLAY SEQUENCE");

  for (int i = 0; i < level; i++) {

    updatePotentiometer();
    checkForReset();

    // Turn LED OFF
    setColor(255, 255, 255);

    // RED
    if (seq[i] == 1) {

      setColor(0, 255, 255);

      tone(BUZZER_PIN, 200, 300);

      Serial.println("RED");
    }

    // GREEN
    else if (seq[i] == 2) {

      setColor(255, 0, 255);

      tone(BUZZER_PIN, 400, 300);

      Serial.println("GREEN");
    }

    // BLUE
    else {

      setColor(255, 255, 0);

      tone(BUZZER_PIN, 600, 300);

      Serial.println("BLUE");
    }

    delay(600);

    // LED OFF
    setColor(255, 255, 255);

    delay(150);
  }

  Serial.println("[STATE] INPUT PHASE");

  int counter = 0;

  while (counter < level) {

    updatePotentiometer();
    checkForReset();

    update(level, millis() - startTime);

    int input = waitForButtonPress();

    Serial.print("INPUT=");
    Serial.print(input);

    Serial.print(" EXPECT=");
    Serial.println(seq[counter]);

    // Correct
    if (input == seq[counter]) {

      Serial.println("✓ CORRECT");

      // White flash
      setColor(255, 255, 255);

      tone(BUZZER_PIN, 900, 100);

      delay(100);

      setColor(0, 0, 0);

      counter++;
    }

    // Wrong
    else {

      Serial.println("✗ WRONG → RESTART LEVEL");

      setColor(255, 0, 0);

      tone(BUZZER_PIN, 100, 600);

      delay(800);

      setColor(0, 0, 0);

      return false;
    }
  }

  Serial.println("LEVEL COMPLETE ✓");

  // Green success flash
  setColor(0, 255, 0);

  tone(BUZZER_PIN, 1200, 300);

  spinServo();

  delay(500);

  setColor(0, 0, 0);

  return true;
}

void update(int level, unsigned long time) {

  unsigned long seconds = time / 1000;

  lcd.setCursor(0, 0);

  lcd.print("Level:");
  lcd.print(level);
  lcd.print("   ");

  lcd.setCursor(0, 1);

  lcd.print("Time:");
  lcd.print(seconds);
  lcd.print("s   ");
}

int waitForButtonPress() {

  Serial.println("[WAIT] Button...");

  while (true) {

    updatePotentiometer();
    checkForReset();

    // RED BUTTON
    if (digitalRead(RED_BUTTON) == LOW) {

      while (digitalRead(RED_BUTTON) == LOW);

      delay(30);

      Serial.println("[BTN] RED");

      return 1;
    }

    // GREEN BUTTON
    if (digitalRead(GREEN_BUTTON) == LOW) {

      while (digitalRead(GREEN_BUTTON) == LOW);

      delay(30);

      Serial.println("[BTN] GREEN");

      return 2;
    }

    // BLUE BUTTON
    if (digitalRead(BLUE_BUTTON) == LOW) {

      while (digitalRead(BLUE_BUTTON) == LOW);

      delay(30);

      Serial.println("[BTN] BLUE");

      return 3;
    }
  }
}