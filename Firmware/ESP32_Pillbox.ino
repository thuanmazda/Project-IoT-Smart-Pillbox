#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "time.h"
#include "RTClib.h"
#include <Preferences.h>

RTC_DS3231 rtc;
DateTime globalNow;
Preferences preferences;

// --- 1. ĐỊNH NGHĨA CHÂN VÀ THÔNG TIN CLOUD ---
#define SWITCH_PIN 4 
#define BUZZER_PIN 19 
String botToken = "8729962677:AAGrT5_69f5CqL8aJl88RomJfY0KPr3c-cs"; 
String chatId = "1922974253"; 
String googleScriptUrl = "https://script.google.com/macros/s/AKfycbyWvpzWuLJ_vV84Uc3rvG5cOGRKCblE85hYOkTFurOL_UT4WP3MSYsnFkm6WfHzJIYH/exec"; 

// --- 2. CẤU HÌNH OLED ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
String currentAction = "He thong san sang"; 

// --- 3. BIẾN DEBOUNCE CÔNG TẮC ---
int lastSwitchState = LOW;
int currentSwitchState = LOW;
unsigned long lastDebounceTime = 0;
unsigned long debounceDelay = 100; 

// --- 4. BIẾN QUẢN LÝ BÁO THỨC & THỜI GIAN ---
struct Alarm {
  int h;
  int m;
  String days;
  bool rungToday; 
};
#define MAX_ALARMS 10
Alarm myAlarms[MAX_ALARMS];
int numAlarms = 0;
unsigned long lastAlarmEndTime = 0; 
bool inLateWindow = false;
bool isAlarmRinging = false;
unsigned long alarmStartTime = 0; 
unsigned long lastSyncTime = 0;
const unsigned long SYNC_INTERVAL = 6 * 3600000; 
unsigned long lastActivityTime = 0;
unsigned long lastPingTime = 0;
const unsigned long PING_INTERVAL = 2 * 60000; // 2 phút (tính bằng mili-giây)

// --- KHAI BÁO CHÂN PIN ---
const int BATTERY_PIN = 33; // Cấu hình đọc áp pin ở chân D33

// --- BIẾN TOÀN CỤC CHO GIAO DIỆN OLED ---
String gioUongThuocKeTiep = "--:--"; 
String dongThongBao = "";

// CÁC BIẾN CHO HIỆU ỨNG THÔNG BÁO 10 GIÂY
unsigned long notificationStartTime = 0; 
bool isShowingNotification = false;      
String tempNotification = "";

// --- BIẾN QUẢN LÝ ĐỘ SÁNG OLED (AOD) ---
unsigned long thoiGianSangManHinh = 0; 
bool isDimmed = false; // Cờ theo dõi trạng thái màn hình

// --- HÀM 1: CẬP NHẬT GIAO DIỆN OLED ---
void capNhatOLED() {
  display.clearDisplay();
  DateTime now = rtc.now(); 
  int phanTramPin = docPhanTramPin(); 

  display.setTextWrap(false); 

  // DÒNG 1: NGÀY THÁNG & PIN
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  if(now.day() < 10) display.print('0');
  display.print(now.day(), DEC); display.print('/');
  if(now.month() < 10) display.print('0');
  display.print(now.month(), DEC); display.print('/');
  display.print(now.year(), DEC);

  display.setCursor(102, 0);
  display.print(phanTramPin); display.print("%");

  // DÒNG 2: GIỜ & PHÚT 
  display.setTextSize(2);
  display.setCursor(34, 18); 
  if(now.hour() < 10) display.print('0');
  display.print(now.hour(), DEC); display.print(':');
  if(now.minute() < 10) display.print('0');
  display.print(now.minute(), DEC);

  // DÒNG 3: DÒNG THÔNG BÁO LINH HOẠT
  display.setTextSize(1);
  display.setCursor(0, 46); // Kéo lên vị trí 46 để đủ không gian cho 2 dòng chữ
  display.print(dongThongBao); 

  display.display();
}

// --- HÀM 2: TÌM LỊCH UỐNG THUỐC TIẾP THEO ĐỂ HIỂN THỊ (ĐÃ FIX LOGIC THỨ) ---
String timBaoThucTiepTheo() {
  if (numAlarms == 0) return "Chua cai dat lich.";
  
  DateTime now = rtc.now();
  int currMins = now.hour() * 60 + now.minute();
  int currWday = now.dayOfTheWeek(); // 0=CN, 1=T2, 2=T3...

  int minMinsFromNow = 999999;
  int nextH = -1;
  int nextM = -1;
  int nextDayDiff = -1;

  for(int i=0; i<numAlarms; i++) {
    int alarmMins = myAlarms[i].h * 60 + myAlarms[i].m;
    
    // Rà soát cả 7 ngày trong tuần xem ngày nào được Web tick chọn
    for(int d=0; d<7; d++) {
      if (myAlarms[i].days.indexOf(String(d)) != -1) { 
        
        int daysDiff = (d - currWday + 7) % 7;
        int minsFromNow = daysDiff * 24 * 60 + (alarmMins - currMins);
        
        // Nếu báo thức thuộc hôm nay nhưng giờ đã qua -> Tính cộng thêm 7 ngày cho tuần sau
        if (minsFromNow <= 0) {
          minsFromNow += 7 * 24 * 60;
        }

        // Tìm ra cột mốc gần nhất với thời điểm hiện tại
        if (minsFromNow < minMinsFromNow) {
          minMinsFromNow = minsFromNow;
          nextH = myAlarms[i].h;
          nextM = myAlarms[i].m;
          
          if (daysDiff == 0 && alarmMins <= currMins) {
             nextDayDiff = 7; // Lịch của tuần sau
          } else {
             nextDayDiff = daysDiff;
          }
        }
      }
    }
  }

  if (nextH == -1) return "Chua chon thu!";

  char buf[30];
  if (nextDayDiff == 0) {
    sprintf(buf, "%02d:%02d (Hom nay)", nextH, nextM);
  } else if (nextDayDiff == 1) {
    sprintf(buf, "%02d:%02d (Ngay mai)", nextH, nextM);
  } else {
    int targetWday = (currWday + nextDayDiff) % 7;
    String dayName = (targetWday == 0) ? "CN" : "T" + String(targetWday + 1);
    sprintf(buf, "%02d:%02d (%s)", nextH, nextM, dayName.c_str());
  }
  
  return "Lich tiep theo:\n" + String(buf);
}

// --- HÀM 3: TẢI BÁO THỨC TỪ GOOGLE SHEETS ---
void taiBaoThucTuGoogle() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client; client.setInsecure(); HTTPClient http;
    Serial.println("\nĐang tải lịch từ Web...");
    http.begin(client, googleScriptUrl + "?action=get_alarms");
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    
    int httpCode = http.GET();
    if (httpCode == 200 || httpCode == 302) {
      String payload = http.getString();
      numAlarms = 0; int startIdx = 0;
      
      while(startIdx < payload.length() && numAlarms < MAX_ALARMS) {
         int commaIdx = payload.indexOf(',', startIdx);
         if(commaIdx == -1) commaIdx = payload.length();
         String alarmStr = payload.substring(startIdx, commaIdx); 
         int pipe1 = alarmStr.indexOf('|'); int pipe2 = alarmStr.indexOf('|', pipe1 + 1);
         if(pipe1 != -1 && pipe2 != -1) {
             String t = alarmStr.substring(0, pipe1); 
             myAlarms[numAlarms].h = t.substring(0,2).toInt();
             myAlarms[numAlarms].m = t.substring(3,5).toInt();
             myAlarms[numAlarms].days = alarmStr.substring(pipe1+1, pipe2); 
             myAlarms[numAlarms].rungToday = false;
             numAlarms++;
         }
         startIdx = commaIdx + 1;
      }
      
      //LƯU LỊCH VÀO FLASH CHO CHẾ ĐỘ OFFLINE//
      preferences.begin("Pillbox", false);
      preferences.putInt("numAlarms", numAlarms);
      for(int i=0; i<numAlarms; i++) {
        preferences.putInt(("h" + String(i)).c_str(), myAlarms[i].h);
        preferences.putInt(("m" + String(i)).c_str(), myAlarms[i].m);
        preferences.putString(("d" + String(i)).c_str(), myAlarms[i].days);
      }
      preferences.end();
      Serial.println("Đã đồng bộ và lưu lịch Offline!");
    }
    http.end();
  }
}

// --- HÀM 4: KIỂM TRA ĐẾN GIỜ KÊU ---
void kiemTraBaoThuc() {
  if (isAlarmRinging) return; 

  //DateTime now = rtc.now(); // Bỏ luôn việc kiểm tra có mạng hay không

  for(int i=0; i < numAlarms; i++) {
    if(globalNow.hour() == myAlarms[i].h && globalNow.minute() == myAlarms[i].m) {
      String currentDay = String(globalNow.dayOfTheWeek());
      if(myAlarms[i].days.indexOf(currentDay) != -1) {
         if(!myAlarms[i].rungToday) {
            isAlarmRinging = true; 
            alarmStartTime = millis(); 
            myAlarms[i].rungToday = true; 
            currentAction = ">>> DEN GIO UONG THUOC <<<";
            Serial.println("KÍCH HOẠT BÁO THỨC!");
         }
      }
    } else {
      myAlarms[i].rungToday = false; 
    }
  }
}

void setup() {
  // --- HẠ XUNG NHỊP CPU XUỐNG 80MHz ĐỂ TIẾT KIỆM PIN ---
  setCpuFrequencyMhz(80);
  Serial.begin(115200);
  pinMode(SWITCH_PIN, INPUT_PULLUP); 
  pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, LOW); 

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("Lỗi: Không tìm thấy OLED")); for(;;); 
  }
  
  display.clearDisplay(); display.setTextSize(1); display.setTextColor(WHITE);
  display.setCursor(0, 20); display.println("Dang ket noi WiFi..."); display.display();

  // 1. KHỞI TẠO RTC
  if (!rtc.begin()) {
    Serial.println("Lỗi: Không tìm thấy module DS3231");
  }
  
  // SỬA LỖI LOGIC: Cảnh báo nếu Pin RTC có vấn đề
  if (rtc.lostPower()) {
    Serial.println("CẢNH BÁO: Mất nguồn RTC! Kiểm tra ngay pin CR2032.");
    
    // Hiển thị trực tiếp ra màn hình OLED để bắt bệnh
    display.clearDisplay();
    display.setCursor(0, 10);
    display.println("!! CANH BAO !!");
    display.println("Pin DS3231 bi long");
    display.println("Hoac lap nguoc cuc!");
    display.display();
    delay(4000); // Dừng 4 giây để bạn kịp đọc cảnh báo
    
    // Tạm lấy giờ nạp code để mạch không bị kẹt ở năm 1970
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__))); 
  }

  // 2. NẠP DỮ LIỆU OFFLINE TỪ FLASH LÊN RAM
  preferences.begin("Pillbox", true); // true = Read Only
  numAlarms = preferences.getInt("numAlarms", 0);
  for(int i=0; i<numAlarms; i++) {
    myAlarms[i].h = preferences.getInt(("h" + String(i)).c_str(), 0);
    myAlarms[i].m = preferences.getInt(("m" + String(i)).c_str(), 0);
    myAlarms[i].days = preferences.getString(("d" + String(i)).c_str(), "");
    myAlarms[i].rungToday = false;
  }
  preferences.end();
  Serial.printf("Đã nạp %d lịch báo thức Offline.\n", numAlarms);

  // 3. THỬ KẾT NỐI WIFI
  WiFiManager wm;
  wm.setConfigPortalTimeout(60); 
  bool res = wm.autoConnect("Hop_Thuoc_IoT"); 
  
  if(!res) {
    // KHÔNG CÓ MẠNG -> CHẠY OFFLINE
    currentAction = "Che do Offline";
    Serial.println("Không kết nối được WiFi. Chạy bằng dữ liệu nội bộ!");
  } else {
    // CÓ MẠNG -> ĐỒNG BỘ GIỜ VÀ LỊCH
    currentAction = "Da ket noi WiFi!";
    WiFi.setTxPower(WIFI_POWER_8_5dBm); // Giảm công suất sóng Wi-Fi để chống sập nguồn
    capNhatOLED();
    
    // NÂNG CẤP LỖI NTP: Sử dụng vòng lặp chờ an toàn
    delay(2000); 
    configTime(7 * 3600, 0, "time.google.com", "time.windows.com", "pool.ntp.org");
    
    struct tm timeinfo;
    Serial.print("Đang dong bo NTP...");
    
    int retry = 0;
    while (!getLocalTime(&timeinfo, 1000) && retry < 10) { 
      Serial.print(".");
      retry++;
    }
    
    if (retry < 10) { 
      // Ép kiểu chuẩn cấu trúc DateTime của RTClib
      rtc.adjust(DateTime(timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday, timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec));
      Serial.println("\n[OK] Đã nạp lại giờ chuẩn mạng cho DS3231.");
    } else {
      Serial.println("\n[LỖI] Mạng quá yếu, không tải được giờ mạng!");
    }
    
    sendTelegramMessage("✅ Hệ thống Hộp Thuốc IoT đã khởi động thành công!");
    logToGoogleSheets("Ping");
    taiBaoThucTuGoogle();
    lastSyncTime = millis();
  }

  // 4. KẾT THÚC SETUP
  digitalWrite(BUZZER_PIN, HIGH); delay(100); digitalWrite(BUZZER_PIN, LOW);
  currentAction = timBaoThucTiepTheo();
  capNhatOLED();
}

void loop() {
  unsigned long currentMillis = millis();

  // --- 0. GỬI NHỊP TIM (PING) ---
  if (currentMillis - lastPingTime > PING_INTERVAL) {
    if (WiFi.status() == WL_CONNECTED) {
      logToGoogleSheets("Ping");
    }
    lastPingTime = currentMillis;
  }

  // --- 1. QUÉT BÁO THỨC & CẬP NHẬT OLED (Mỗi 1 giây) ---
  static unsigned long lastTimeUpdate = 0;
  static int lastMinute = -1; 
  
  if (currentMillis - lastTimeUpdate > 1000) {
    globalNow = rtc.now();
    kiemTraBaoThuc();
    
    if (!isAlarmRinging && globalNow.minute() != lastMinute) {
      gioUongThuocKeTiep = timBaoThucTiepTheo(); 
      lastMinute = globalNow.minute();
    }

    // LOGIC ƯU TIÊN HIỂN THỊ DÒNG THÔNG BÁO
    if (isAlarmRinging) {
        dongThongBao = ">> DEN GIO UONG! <<";
        thoiGianSangManHinh = currentMillis; 
    } 
    else if (isShowingNotification) {
        if (currentMillis - notificationStartTime <= 10000) {
            dongThongBao = tempNotification;
        } else {
            isShowingNotification = false; 
            dongThongBao = gioUongThuocKeTiep;
        }
    } 
    else {
        dongThongBao = gioUongThuocKeTiep;
    }

    // ======================================================
    // LOGIC TIẾT KIỆM PIN: DEEP DIMMING SAU 30 GIÂY
    // ======================================================
    if (currentMillis - thoiGianSangManHinh <= 30000) {
        // --- CHẾ ĐỘ SÁNG BÌNH THƯỜNG ---
        if (isDimmed) {
            // 1. Phục hồi thời gian nạp mồi (Mặc định của thư viện là 0xF1)
            display.ssd1306_command(SSD1306_SETPRECHARGE);
            display.ssd1306_command(0xF1); 
            // 2. Phục hồi điện áp nền VCOMH (Mặc định là 0x40)
            display.ssd1306_command(SSD1306_SETVCOMDETECT);
            display.ssd1306_command(0x40);
            // 3. Phục hồi độ sáng tối đa
            display.ssd1306_command(SSD1306_SETCONTRAST);
            display.ssd1306_command(255); 
            
            isDimmed = false;
        }
    } else {
        // --- CHẾ ĐỘ NGỦ MỜ (DEEP DIMMING) ---
        if (!isDimmed) {
            // 1. Cắt giảm tối đa thời gian nạp mồi (Xuống mức 0x22)
            display.ssd1306_command(SSD1306_SETPRECHARGE);
            display.ssd1306_command(0x22); 
            // 2. Ép điện áp nền VCOMH xuống mức thấp nhất
            display.ssd1306_command(SSD1306_SETVCOMDETECT);
            display.ssd1306_command(0x00);
            // 3. Hạ Contrast về 0 (Mức thấp tuyệt đối)
            display.ssd1306_command(SSD1306_SETCONTRAST);
            display.ssd1306_command(0); 
            
            isDimmed = true;
        }
    }

    capNhatOLED();
    lastTimeUpdate = currentMillis;
  }

  // --- 2. LOGIC ĐỔ CHUÔNG BÁO THỨC & XỬ LÝ BỎ CỮ ---
  if (isAlarmRinging) {
     lastActivityTime = millis();
     unsigned long elapsed = millis() - alarmStartTime;
     
     if (elapsed >= 300000UL) { 
        isAlarmRinging = false;
        digitalWrite(BUZZER_PIN, LOW); 
        
        // LUÔN GỬI SHEETS TRƯỚC VÀ NGHỈ 1S
        logToGoogleSheets("Bo_Thuoc"); 
        delay(1000);
        sendTelegramMessage("⚠️ CẢNH BÁO: Đã qua 5 phút nhắc nhở nhưng nắp hộp chưa mở (BỎ CỮ)!");
        
        gioUongThuocKeTiep = timBaoThucTiepTheo();
        lastAlarmEndTime = millis(); 
        inLateWindow = true; 
     } else {
        unsigned long cyclePos = elapsed % 40000UL;
        if (cyclePos < 10000UL) {
            if ((millis() % 1000) < 500) digitalWrite(BUZZER_PIN, HIGH);
            else digitalWrite(BUZZER_PIN, LOW);
        } else {
            digitalWrite(BUZZER_PIN, LOW);
        }
     }
  }

  // --- 3. ĐỌC CÔNG TẮC HÀNH TRÌNH (Kèm Uống trễ & Ghi Log) ---
  int reading = digitalRead(SWITCH_PIN);
  if (reading != lastSwitchState) lastDebounceTime = currentMillis; 

  if ((currentMillis - lastDebounceTime) > debounceDelay) {
    if (reading != currentSwitchState) {
      currentSwitchState = reading;
      lastActivityTime = millis(); 
      thoiGianSangManHinh = millis();
      
      if (currentSwitchState == HIGH) { // ===== TRẠNG THÁI: MỞ NẮP =====
        tempNotification = ">> HOP DANG MO <<";
        isShowingNotification = true;
        notificationStartTime = millis(); 

        if (inLateWindow) {
          if (millis() - lastAlarmEndTime <= 1500000UL) { 
            // GỬI SHEETS TRƯỚC, NGHỈ 1S, RỒI GỬI TELEGRAM
            logToGoogleSheets("Uong_Tre");
            delay(1000);
            sendTelegramMessage("✅ Cập nhật: Bệnh nhân đã uống thuốc bù (Uống trễ)!");
            Serial.println("Ghi nhận: Uống trễ.");
          }
          inLateWindow = false;
        }
        else if (isAlarmRinging) {
           isAlarmRinging = false;
           inLateWindow = false;
           digitalWrite(BUZZER_PIN, LOW);
           Serial.println("Đã tắt báo thức do người dùng mở nắp.");
        }
        
        // Kịch bản C: Log trạng thái Mở nắp chung
        logToGoogleSheets("Mo_Nap");
        delay(1000);
        sendTelegramMessage("⚠️ CẢNH BÁO: Nắp hộp thuốc đang được mở!");
        
      } 
      else { // ===== TRẠNG THÁI: ĐÓNG NẮP =====
        tempNotification = ">> DA DONG NAP <<";
        isShowingNotification = true;
        notificationStartTime = millis(); 

        digitalWrite(BUZZER_PIN, HIGH); delay(100); digitalWrite(BUZZER_PIN, LOW); 
        
        // GỬI SHEETS TRƯỚC, NGHỈ 1S, RỒI GỬI TELEGRAM
        logToGoogleSheets("Dong_Nap");
        delay(1000);
        sendTelegramMessage("ℹ️ Nắp hộp thuốc đã được đóng lại an toàn.");
        
        gioUongThuocKeTiep = timBaoThucTiepTheo();
      }
    }
  }   
  lastSwitchState = reading;
  
  // --- 4. ĐỒNG BỘ LỊCH TỰ ĐỘNG TỪ GOOGLE SHEETS ---
  if (currentMillis - lastSyncTime > SYNC_INTERVAL) {
    taiBaoThucTuGoogle();
    lastSyncTime = currentMillis;
  }
}

void sendTelegramMessage(String message) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client; client.setInsecure(); HTTPClient http;
    message.replace(" ", "%20");
    http.begin(client, "https://api.telegram.org/bot" + botToken + "/sendMessage?chat_id=" + chatId + "&text=" + message);
    http.GET(); http.end();
  }
} 



void logToGoogleSheets(String action) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client; client.setInsecure(); HTTPClient http;
    http.begin(client, googleScriptUrl + "?action=" + action);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    
    // Bắt buộc phải lấy mã phản hồi từ Google
    int httpCode = http.GET(); 
    String payload = http.getString(); // THÊM MỚI: Đọc nội dung phản hồi từ Google
    http.end();
    
    if (httpCode > 0) {
      // In thẳng nội dung phản hồi ra màn hình để bắt lỗi
      Serial.println("Đã gửi Cloud: " + action + " - Phản hồi: " + payload);
    } else {
      Serial.println("LỖI GỬI CLOUD: " + action + " (Mã lỗi: " + String(httpCode) + " - " + http.errorToString(httpCode) + ")");
    }
  } else {
    // NẾU MẤT MẠNG -> LƯU VÀO FLASH (OFFLINE QUEUE)
    DateTime now = rtc.now();
    String timeStr = String(now.day()) + "/" + String(now.month()) + "/" + String(now.year()) + " " + 
                     String(now.hour()) + ":" + String(now.minute()) + ":" + String(now.second());
    
    preferences.begin("OfflineData", false);
    int count = preferences.getInt("q_count", 0); 
    preferences.putString(("act" + String(count)).c_str(), action);
    preferences.putString(("time" + String(count)).c_str(), timeStr);
    preferences.putInt("q_count", count + 1); 
    preferences.end();
    
    Serial.println("Rớt mạng! Đã lưu Offline sự kiện: " + action);
  }
}

// --- HÀM ĐỌC VÀ TÍNH TOÁN PHẦN TRĂM PIN ---
int docPhanTramPin() {
  // Lấy giá trị ADC từ chân 34 (Độ phân giải 12-bit: 0 - 4095)
  int adcValue = analogRead(BATTERY_PIN);
  
  // Tính điện áp tại chân ESP32 (V_ADC)
  // ESP32 có điện áp tham chiếu là 3.3V
  float adcVoltage = (adcValue / 4095.0) * 3.3;
  
  // Phục hồi lại điện áp thực tế của Pin (Vì đã bị chia đôi qua 2 trở 100k)
  float batVoltage = adcVoltage * 2.0;

  // Tính phần trăm dung lượng (Giả sử dải hoạt động của pin Li-ion từ 3.2V đến 4.2V)
  int batPercent = 0;
  if (batVoltage >= 4.2) {
    batPercent = 100;
  } else if (batVoltage <= 3.2) {
    batPercent = 0;
  } else {
    // Ép kiểu phân số tuyến tính từ khoảng 3.2V - 4.2V sang 0% - 100%
    batPercent = (batVoltage - 3.2) / (4.2 - 3.2) * 100.0;
  }
  
  // Đảm bảo % không bị vượt quá giới hạn 0-100 do nhiễu số
  return constrain(batPercent, 0, 100);
}