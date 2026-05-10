float duration, distance; 
bool is_present;

const int pinX = A0; 
const int pinY = A1; 
const int pinSW = 5; 
const int pinMorse = 3; 

void setup() {
  pinMode(7, OUTPUT);   pinMode(10, INPUT);   
  pinMode(9, OUTPUT);   pinMode(2, OUTPUT);
  pinMode(3, INPUT_PULLUP);
  pinMode(13, OUTPUT);  pinMode(pinSW, INPUT_PULLUP); 


  //i needed really high baud rate cuz the joystick needed high-precision data stream
  Serial.begin(115200); 
}

void loop() {
  if(digitalRead(3) == HIGH){
    digitalWrite(13, LOW); noTone(2);
  } else {
    digitalWrite(13, HIGH); tone(2, 2000);
  }
    
  //timeout to prevent mouse from freezes
  digitalWrite(9, LOW); delayMicroseconds(2);
  digitalWrite(9, HIGH); delayMicroseconds(10);
  digitalWrite(9, LOW);
  

  duration = pulseIn(10, HIGH, 20000); 
  distance = duration * 0.034 / 2;

  int xVal = analogRead(pinX);
  int yVal = analogRead(pinY);
  int swVal = digitalRead(pinSW);
  int mVal = digitalRead(pinMorse);


  Serial.print("JS:");
  Serial.print(xVal); Serial.print(",");
  Serial.print(yVal); Serial.print(",");
  Serial.print(swVal); Serial.print(",");
  Serial.print(distance); Serial.print(",");
  Serial.println(mVal);

  delay(10);
}
