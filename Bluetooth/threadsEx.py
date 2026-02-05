import threading
import time

command = ''
count = 0
def user_input():
    global command
    while(1):
        if command != 'stop':
            command = input('Enter stop to stop the program: ')
        else:
            break

def count_display():
    global command
    global count
    while(1):
        if command != 'stop':
            # Increase the variable count
            count = count + 1
            # Print count
            print(count)
            # Delay 1 second
            time.sleep(1)
        else:
            break

thread1 = threading.Thread(target = user_input)
thread2 = threading.Thread(target = count_display)
thread1.start()
thread2.start()
