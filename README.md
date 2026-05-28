# 💊 IoT Smart Pillbox - Hộp Thuốc Thông Minh

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-ESP32-green.svg)
![Framework](https://img.shields.io/badge/framework-Arduino%20IDE-orange.svg)

**IoT Smart Pillbox** là hệ thống hộp thuốc điện tử thông minh được thiết kế nhằm hỗ trợ người cao tuổi và bệnh nhân trong việc tuân thủ phác đồ điều trị. Dự án ứng dụng vi điều khiển ESP32, kết hợp đồng bộ hóa đám mây qua Google Apps Script và hệ thống cảnh báo tức thời qua Telegram.

> **Đồ án môn học 1 (EE3183)** > Khoa Điện - Điện tử, Trường Đại học Bách Khoa - ĐHQG TP.HCM.

---

## ✨ Tính năng nổi bật
* **Định thời gian thực chuẩn xác:** Sử dụng module RTC DS3231 đảm bảo báo thức hoạt động chính xác ngay cả khi mất kết nối Internet.
* **Cấu hình Wi-Fi động (Captive Portal):** Cho phép người dùng kết nối mạng mới thông qua điện thoại thông minh (WiFiManager) mà không cần nạp lại mã nguồn.
* **Theo dõi & Báo cáo đám mây:** Tự động đẩy lịch sử đóng/mở nắp hộp (thông qua công tắc hành trình) lên Google Sheets.
* **Cảnh báo Telegram tức thời:** Gửi tin nhắn thông báo cho người nhà khi đến giờ uống thuốc, uống thuốc trễ hoặc mở hộp sai giờ.
* **Tối ưu năng lượng:** Tích hợp tính năng Deep Dimming (giảm sáng màn hình OLED) để tiết kiệm pin tối đa.
* **Lưu trữ ngoại tuyến (Offline Mode):** Lưu trữ tạm thời dữ liệu vào bộ nhớ Flash (NVS) khi rớt mạng và tự động đồng bộ lại khi có kết nối.

---

## 📂 Cấu trúc thư mục (Directory Tree)

```text
IoT-Smart-Pillbox/
├── 📁 Firmware/
│   └── 📄 ESP32_Pillbox.ino          # Mã nguồn C++ nạp cho vi điều khiển ESP32
├── 📁 Web_App_Script/
│   ├── 📄 Code.gs                    # Mã nguồn Backend (Google Apps Script)
│   └── 📄 Index.html                 # Giao diện Web quản lý (Frontend)
├── 📁 Hardware/
│   ├── 📄 Schematic_Altium.pdf       # File PDF bản vẽ sơ đồ nguyên lý
│   └── 📄 BOM.csv                    # Bảng danh mục vật tư (Bill of Materials)
├── 📁 Docs/
│   └── 📄 BAO_CAO_DO_AN_1.pdf        # Báo cáo thuyết minh chi tiết của đồ án
└── 📄 README.md                      # Tài liệu hướng dẫn dự án (File này)

```
## 🛠️ Cài đặt & Triển khai hệ thống

### 1. Thi công phần cứng
* Lắp ráp các linh kiện điện tử theo đúng sơ đồ nguyên lý (`Schematic_Altium.pdf`) được cung cấp trong thư mục `Hardware`.
* Dưới đây là hình ảnh nguyên mẫu phần cứng sau khi thi công và tích hợp vào vỏ hộp:

> **📸 Hình ảnh mạch thực tế:**
> 
> ![Mô hình hoàn thiện](thay_link_anh_mach_thuc_te_cua_ban_vao_day.jpg)

---

### 2. Triển khai Cơ sở dữ liệu (Google Sheets & Apps Script)
Hệ thống sử dụng Google Sheets làm cơ sở dữ liệu miễn phí và Google Apps Script làm Backend API.

1. **Tạo Google Sheet:** Tạo một bảng tính mới để lưu trữ nhật ký.
   * 👉 [🔗 Tham khảo mẫu Cơ sở dữ liệu Google Sheet của dự án tại đây](thay_link_google_sheet_cua_ban_vao_day)
2. **Triển khai Script:** * Mở `Tiện ích mở rộng` -> `Apps Script`.
   * Copy nội dung file `Web_App_Script/Code.gs` và `Index.html` dán vào.
   * Chọn `Phát triển` -> `Triển khai mới` -> Chọn loại `Ứng dụng Web` (Quyền truy cập: Bất kỳ ai).
   * **Lưu lại đường dẫn Web App URL** để nạp vào ESP32.

---

### 3. Nạp mã nguồn ESP32 (Firmware)
1. Cài đặt [Arduino IDE](https://www.arduino.cc/en/software) và thêm board ESP32 vào Board Manager.
2. Cài đặt các thư viện bắt buộc thông qua Library Manager:
   * `WiFiManager` (bởi tzapu)
   * `RTClib` (bởi Adafruit)
   * `Adafruit SSD1306` & `Adafruit GFX Library`
   * `NTPClient` (bởi Fabrice Weinberg)
3. Mở file `Firmware/ESP32_Pillbox.ino`.
4. Tìm đến vùng cấu hình và thay thế các thông số sau bằng thông tin của bạn:
   ```cpp
   String GAS_URL = "Dán_Web_App_URL_của_bạn_vào_đây";
   String BOT_TOKEN = "Dán_Token_Telegram_Bot_của_bạn_vào_đây";
   String CHAT_ID = "Dán_Chat_ID_của_bạn_vào_đây";
   ```
   
