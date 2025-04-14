// Define macro in Arduino IDE
#define HEADER1 (0xAA)
#define HEADER2 (0x55)
// Declare global variable
unsigned int TX_FrameTransfer[4]; //  declare an Array unsigned to store transfer data 
unsigned int cnt=0; // declare global variable to generate triangle signal 

void setup(void)
{
// Initial function of the program 
  Serial.begin(9600); // set up UART with the baudrate is 9600 bits/sec 

}

void loop(void) 
{ 
  cnt++;
  if(cnt>50)cnt=0;
 TX_FrameTransfer[0]=HEADER1; // add the first header to Frame 
 TX_FrameTransfer[1]=HEADER2; // add second header to Frame
 TX_FrameTransfer[2]=((cnt&0xff00)>>8); // add High byte to Frame
 TX_FrameTransfer[3]=((cnt&0x00ff)); // add Low byte to Frame
 for(unsigned int i=0;i<4;i++)// loop for transfer 4 byte data 
 {
  Serial.write(TX_FrameTransfer[i]);
  delay(1);
 }
 delay(20);
//  Serial.println(cnt);
//  delay(500);
}